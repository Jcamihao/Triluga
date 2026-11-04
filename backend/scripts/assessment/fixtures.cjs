const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const Redis = require('ioredis');
const crypto = require('node:crypto');
const { loadState, saveState, dbUrl } = require('./runtime.cjs');
const state = loadState();
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl(state) } } });

async function seed() {
  if (state.users && !state.cleanedAt) throw new Error('Fixtures already created and not cleaned.');
  const count = Number(process.argv.find(a => a.startsWith('--users='))?.split('=')[1] ?? 100);
  if (!Number.isInteger(count) || count < 1 || count > 200) throw new Error('User count must be between 1 and 200.');
  if (state.cleanedAt) {
    state.prefix = `assessment-${crypto.randomBytes(6).toString('hex')}`;
    state.password = crypto.randomBytes(18).toString('base64url') + '!9';
    delete state.cleanedAt;
  }
  state.loadUsers = count;
  state.originalCounts = { users: await prisma.user.count(), vehicles: await prisma.vehicle.count() };
  const passwordHash = await bcrypt.hash(state.password, 10);
  state.users = [];
  // Persist each identifier immediately so interrupted runs can still clean up.
  saveState(state);
  for (let i = 0; i < Math.max(count + 4, 104); i++) {
    const user = await prisma.user.create({ data: {
      email: `${state.prefix}-${i}@example.test`, role: 'USER', passwordHash,
      emailVerified: true,
      profile: { create: { fullName: `Triluga Assessment ${i}`, phone: '11900000000', city: 'Campinas', state: 'SP', documentNumber: '00000000000', addressLine: 'Endereço sintético do pentest' } },
    }, select: { id: true, email: true } });
    state.users.push(user);
    saveState(state);
  }
  state.vehicles = [];
  for (let i = 0; i < 12; i++) {
    const vehicle = await prisma.vehicle.create({ data: {
      ownerId: state.users[100].id, slug: `${state.prefix}-vehicle-${i}`,
      title: `${state.prefix} Test Vehicle ${i}`, brand: 'Assessment', model: `Model ${i}`,
      year: 2024, plate: `${state.prefix}-${i}`, city: 'Campinas', state: 'SP',
      category: 'ECONOMY', transmission: 'MANUAL', fuelType: 'FLEX', seats: 5,
      dailyRate: 100 + i, description: 'Anúncio sintético para teste local autorizado.',
      isPublished: i !== 11,
    }, select: { id: true, slug: true } });
    state.vehicles.push(vehicle);
    saveState(state);
  }
  console.log(JSON.stringify({ usersCreated: state.users.length, vehiclesCreated: state.vehicles.length, originalCounts: state.originalCounts }));
}
async function cleanup() {
  const ids = (state.users ?? []).map(u => u.id);
  const result = await prisma.user.deleteMany({ where: { email: { startsWith: state.prefix + '-' } } });
  const redis = new Redis('redis://127.0.0.1:6383/1');
  let removedCacheEntries = 0;
  const vehicleIds = (state.vehicles ?? []).flatMap(v => [v.id, v.slug]);
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'COUNT', '100'); cursor = next;
    for (const key of keys) {
      const type = await redis.type(key);
      if (type !== 'string') continue;
      const value = await redis.get(key);
      if ([state.prefix, ...ids, ...vehicleIds].some(marker => key.includes(marker) || value?.includes(marker))) {
        removedCacheEntries += await redis.del(key);
      }
    }
  } while (cursor !== '0');
  await redis.quit();
  const remainingUsers = await prisma.user.count({ where: { email: { startsWith: state.prefix + '-' } } });
  const remainingVehicles = await prisma.vehicle.count({ where: { slug: { startsWith: state.prefix } } });
  state.cleanedAt = new Date().toISOString(); saveState(state);
  console.log(JSON.stringify({ usersDeleted: result.count, remainingUsers, remainingVehicles, removedCacheEntries }));
}
(process.argv[2] === 'cleanup' ? cleanup() : seed()).catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
