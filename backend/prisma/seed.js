const bcrypt = require('bcryptjs');
const Redis = require('ioredis');
const {
  PrismaClient,
  Role,
  VehicleCategory,
  VehicleType,
  MotorcycleStyle,
  FuelType,
  Transmission,
  NotificationType,
} = require('@prisma/client');

const prisma = new PrismaClient();

async function invalidateVehicleCache() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return;
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
  try {
    const keys = await redis.keys('vehicles:*');
    if (keys.length > 0) await redis.del(...keys);
  } catch {
    console.warn('Não foi possível invalidar o cache Redis durante o seed.');
  } finally {
    await redis.quit();
  }
}

async function createUserWithProfile({
  email, password, role, fullName, phone,
  zipCode, addressLine, addressComplement, city, state,
  emailVerified = false,
  documentVerificationStatus = 'NOT_SUBMITTED',
  driverLicenseVerification = 'NOT_SUBMITTED',
}) {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.upsert({
    where: { email },
    update: {
      role, status: 'ACTIVE', passwordHash, emailVerified,
      profile: {
        upsert: {
          update: { fullName, phone, zipCode, addressLine, addressComplement, city, state, documentVerificationStatus, driverLicenseVerification },
          create: { fullName, phone, zipCode, addressLine, addressComplement, city, state, documentVerificationStatus, driverLicenseVerification },
        },
      },
    },
    create: {
      email, passwordHash, role, emailVerified,
      profile: { create: { fullName, phone, zipCode, addressLine, addressComplement, city, state, documentVerificationStatus, driverLicenseVerification } },
    },
    include: { profile: true },
  });
}

async function main() {
  const [admin, mariana, lucas, fernanda, rafael, camila] = await Promise.all([
    createUserWithProfile({
      email: 'admin.triluga@triluga.com', password: 'DMJ@123ABC', role: Role.ADMIN,
      fullName: 'Admin Triluga', phone: '+55 11 90000-0001',
      zipCode: '01001-000', addressLine: 'Praça da Sé', addressComplement: 'Sala administrativa',
      city: 'São Paulo', state: 'SP', emailVerified: true,
      documentVerificationStatus: 'APPROVED', driverLicenseVerification: 'APPROVED',
    }),
    createUserWithProfile({
      email: 'mariana@triluga.local', password: 'User123!', role: Role.USER,
      fullName: 'Mariana Costa', phone: '+55 11 91111-0002',
      zipCode: '01310-100', addressLine: 'Avenida Paulista, 1374', addressComplement: 'Apto 84',
      city: 'São Paulo', state: 'SP', emailVerified: true,
      documentVerificationStatus: 'APPROVED', driverLicenseVerification: 'APPROVED',
    }),
    createUserWithProfile({
      email: 'lucas@triluga.local', password: 'User123!', role: Role.USER,
      fullName: 'Lucas Almeida', phone: '+55 19 92222-0003',
      zipCode: '13010-111', addressLine: 'Rua Conceição, 550', addressComplement: 'Casa 2',
      city: 'Campinas', state: 'SP', emailVerified: true,
      documentVerificationStatus: 'APPROVED', driverLicenseVerification: 'APPROVED',
    }),
    createUserWithProfile({
      email: 'fernanda@triluga.local', password: 'User123!', role: Role.USER,
      fullName: 'Fernanda Ribeiro', phone: '+55 21 93333-0004',
      zipCode: '22070-900', addressLine: 'Avenida Atlântica, 1702', addressComplement: 'Cobertura',
      city: 'Rio de Janeiro', state: 'RJ', emailVerified: true,
      documentVerificationStatus: 'APPROVED', driverLicenseVerification: 'APPROVED',
    }),
    createUserWithProfile({
      email: 'rafael@triluga.local', password: 'User123!', role: Role.USER,
      fullName: 'Rafael Souza', phone: '+55 41 94444-0005',
      zipCode: '80010-010', addressLine: 'Rua XV de Novembro, 341',
      city: 'Curitiba', state: 'PR', emailVerified: true,
      documentVerificationStatus: 'APPROVED', driverLicenseVerification: 'APPROVED',
    }),
    createUserWithProfile({
      email: 'camila@triluga.local', password: 'User123!', role: Role.USER,
      fullName: 'Camila Ferreira', phone: '+55 31 95555-0006',
      zipCode: '30112-000', addressLine: 'Avenida do Contorno, 8000',
      city: 'Belo Horizonte', state: 'MG', emailVerified: true,
      documentVerificationStatus: 'APPROVED', driverLicenseVerification: 'APPROVED',
    }),
  ]);

  // Limpa veículos dos owners de seed
  const seedOwnerIds = [mariana.id, lucas.id, fernanda.id, rafael.id, camila.id];
  await prisma.vehicleImage.deleteMany({ where: { vehicle: { ownerId: { in: seedOwnerIds } } } });
  await prisma.vehicle.deleteMany({ where: { ownerId: { in: seedOwnerIds } } });
  await prisma.userReview.deleteMany();
  await prisma.review.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.siteVisit.deleteMany();

  const vehicles = await prisma.$transaction([
    // 1. Jeep Renegade — SP
    prisma.vehicle.create({ data: {
      ownerId: mariana.id, slug: 'jeep-renegade-2022-sao-paulo',
      title: 'Jeep Renegade Longitude 2022', brand: 'Jeep', model: 'Renegade',
      year: 2022, plate: 'CAR2B22', city: 'São Paulo', state: 'SP',
      vehicleType: VehicleType.CAR, category: VehicleCategory.SUV,
      transmission: Transmission.AUTOMATIC, fuelType: FuelType.FLEX, seats: 5,
      dailyRate: 289.9, weeklyRate: 1490, kmPolicy: 'FREE',
      addressLine: 'Avenida Paulista, 1374 — Bela Vista',
      isPublished: true,
      description: 'SUV confortável para uso urbano e viagens, com multimídia, câmera de ré, ar digital e controle de tração. Retirada fácil no metrô Paulista.',
      latitude: -23.5651, longitude: -46.6527,
      images: { create: [
        { url: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=80', key: 'seed/renegade-1.jpg', alt: 'Jeep Renegade lateral', position: 0 },
        { url: 'https://images.unsplash.com/photo-1519641471654-76ce0107ad5b?auto=format&fit=crop&w=1200&q=80', key: 'seed/renegade-2.jpg', alt: 'SUV estrada', position: 1 },
        { url: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=1200&q=80', key: 'seed/renegade-3.jpg', alt: 'Interior SUV', position: 2 },
      ]},
    }}),

    // 2. Chevrolet Onix — Campinas
    prisma.vehicle.create({ data: {
      ownerId: lucas.id, slug: 'chevrolet-onix-2023-campinas',
      title: 'Chevrolet Onix LT 2023', brand: 'Chevrolet', model: 'Onix',
      year: 2023, plate: 'CAR3B23', city: 'Campinas', state: 'SP',
      vehicleType: VehicleType.CAR, category: VehicleCategory.HATCH,
      transmission: Transmission.AUTOMATIC, fuelType: FuelType.FLEX, seats: 5,
      dailyRate: 159.9, weeklyRate: 790, kmPolicy: 'FREE',
      addressLine: 'Rua Conceição, 550 — Centro',
      isPublished: true,
      description: 'Hatch econômico e confiável, ótimo para cidade. Direção elétrica, multimídia com Android Auto e Apple CarPlay. Consumo médio de 13 km/l.',
      latitude: -22.9056, longitude: -47.0608,
      images: { create: [
        { url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=1200&q=80', key: 'seed/onix-1.jpg', alt: 'Hatch branco', position: 0 },
        { url: 'https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&w=1200&q=80', key: 'seed/onix-2.jpg', alt: 'Sedã prata', position: 1 },
      ]},
    }}),

    // 3. Toyota Corolla — Rio de Janeiro
    prisma.vehicle.create({ data: {
      ownerId: fernanda.id, slug: 'toyota-corolla-2023-rio-de-janeiro',
      title: 'Toyota Corolla XEi 2023', brand: 'Toyota', model: 'Corolla',
      year: 2023, plate: 'RIO3C23', city: 'Rio de Janeiro', state: 'RJ',
      vehicleType: VehicleType.CAR, category: VehicleCategory.SEDAN,
      transmission: Transmission.AUTOMATIC, fuelType: FuelType.FLEX, seats: 5,
      dailyRate: 229.9, weeklyRate: 1150, kmPolicy: 'FREE',
      addressLine: 'Avenida Atlântica, 1702 — Copacabana',
      isPublished: true,
      description: 'Sedan executivo com acabamento premium, couro, teto solar e piloto automático. Perfeito para viagens e uso executivo no Rio. Estacionamento privativo.',
      latitude: -22.9711, longitude: -43.1822,
      images: { create: [
        { url: 'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?auto=format&fit=crop&w=1200&q=80', key: 'seed/corolla-1.jpg', alt: 'Toyota Corolla', position: 0 },
        { url: 'https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&w=1200&q=80', key: 'seed/corolla-2.jpg', alt: 'Sedan executivo', position: 1 },
        { url: 'https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=1200&q=80', key: 'seed/corolla-3.jpg', alt: 'Interior couro', position: 2 },
      ]},
    }}),

    // 4. BMW X1 — São Paulo (Luxury)
    prisma.vehicle.create({ data: {
      ownerId: mariana.id, slug: 'bmw-x1-2023-sao-paulo',
      title: 'BMW X1 sDrive20i 2023', brand: 'BMW', model: 'X1',
      year: 2023, plate: 'BMW3X23', city: 'São Paulo', state: 'SP',
      vehicleType: VehicleType.CAR, category: VehicleCategory.LUXURY,
      transmission: Transmission.AUTOMATIC, fuelType: FuelType.GASOLINE, seats: 5,
      dailyRate: 549.9, weeklyRate: 2490, kmPolicy: 'FIXED',
      addressLine: 'Rua Oscar Freire, 900 — Jardins',
      isPublished: true,
      description: 'BMW X1 seminovo em estado de zero, com head-up display, câmeras 360°, bancos em couro Dakota e pacote M Sport. Limite de 300 km/semana inclusos.',
      latitude: -23.5631, longitude: -46.6684,
      images: { create: [
        { url: 'https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=1200&q=80', key: 'seed/bmw-1.jpg', alt: 'BMW X1 branco', position: 0 },
        { url: 'https://images.unsplash.com/photo-1556189250-72ba954cfc2b?auto=format&fit=crop&w=1200&q=80', key: 'seed/bmw-2.jpg', alt: 'BMW lateral', position: 1 },
        { url: 'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?auto=format&fit=crop&w=1200&q=80', key: 'seed/bmw-3.jpg', alt: 'Painel BMW', position: 2 },
      ]},
    }}),

    // 5. Ford Ranger — Belo Horizonte (Pickup)
    prisma.vehicle.create({ data: {
      ownerId: camila.id, slug: 'ford-ranger-2022-belo-horizonte',
      title: 'Ford Ranger XLS 4x4 2022', brand: 'Ford', model: 'Ranger',
      year: 2022, plate: 'BHZ2R22', city: 'Belo Horizonte', state: 'MG',
      vehicleType: VehicleType.CAR, category: VehicleCategory.PICKUP,
      transmission: Transmission.AUTOMATIC, fuelType: FuelType.DIESEL, seats: 5,
      dailyRate: 379.9, weeklyRate: 1790, kmPolicy: 'FREE',
      addressLine: 'Avenida do Contorno, 8000 — Santo Antônio',
      isPublished: true,
      description: 'Ranger 4x4 diesel pronta para qualquer terreno. Ideal para fazendas, obras ou viagens off-road. Caçamba coberta, engate e para-choque traseiro reforçado.',
      latitude: -19.9167, longitude: -43.9345,
      images: { create: [
        { url: 'https://images.unsplash.com/photo-1590362891991-f776e747a588?auto=format&fit=crop&w=1200&q=80', key: 'seed/ranger-1.jpg', alt: 'Ford Ranger pickup', position: 0 },
        { url: 'https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=1200&q=80', key: 'seed/ranger-2.jpg', alt: 'Pickup estrada de terra', position: 1 },
        { url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1200&q=80', key: 'seed/ranger-3.jpg', alt: 'Pickup perfil', position: 2 },
      ]},
    }}),

    // 6. Volkswagen T-Cross — Curitiba
    prisma.vehicle.create({ data: {
      ownerId: rafael.id, slug: 'volkswagen-t-cross-2024-curitiba',
      title: 'Volkswagen T-Cross Highline 2024', brand: 'Volkswagen', model: 'T-Cross',
      year: 2024, plate: 'CWB4T24', city: 'Curitiba', state: 'PR',
      vehicleType: VehicleType.CAR, category: VehicleCategory.SUV,
      transmission: Transmission.AUTOMATIC, fuelType: FuelType.FLEX, seats: 5,
      dailyRate: 249.9, weeklyRate: 1190, kmPolicy: 'FREE',
      addressLine: 'Rua XV de Novembro, 341 — Centro',
      isPublished: true,
      description: 'T-Cross Highline 2024 zero km de uso, com Wireless CarPlay, assistente de frenagem e câmera traseira. Ótimo para família ou viagens para o litoral paranaense.',
      latitude: -25.4284, longitude: -49.2733,
      images: { create: [
        { url: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=1200&q=80', key: 'seed/tcross-1.jpg', alt: 'VW T-Cross azul', position: 0 },
        { url: 'https://images.unsplash.com/photo-1519641471654-76ce0107ad5b?auto=format&fit=crop&w=1200&q=80', key: 'seed/tcross-2.jpg', alt: 'SUV compacto estrada', position: 1 },
      ]},
    }}),

    // 7. Yamaha NMAX — São Paulo (Scooter)
    prisma.vehicle.create({ data: {
      ownerId: mariana.id, slug: 'yamaha-nmax-160-2024-sao-paulo',
      title: 'Yamaha NMAX 160 ABS 2024', brand: 'Yamaha', model: 'NMAX 160',
      year: 2024, plate: 'MOT4A24', city: 'São Paulo', state: 'SP',
      vehicleType: VehicleType.MOTORCYCLE, category: VehicleCategory.ECONOMY,
      transmission: Transmission.CVT, fuelType: FuelType.GASOLINE, seats: 2,
      dailyRate: 89.9, weeklyRate: 420, kmPolicy: 'FREE',
      motorcycleStyle: MotorcycleStyle.SCOOTER, engineCc: 160, hasAbs: true, hasTopCase: true,
      addressLine: 'Avenida Paulista, 1374 — Bela Vista',
      isPublished: true,
      description: 'Scooter moderna e ágil para deslocamentos urbanos em SP. Baú incluso (27L), freios ABS, painel digital e ótimo consumo (~40 km/l). Furar engarrafamento ficou fácil.',
      latitude: -23.5631, longitude: -46.6550,
      images: { create: [
        { url: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1200&q=80', key: 'seed/nmax-1.jpg', alt: 'Scooter Yamaha NMAX', position: 0 },
        { url: 'https://images.unsplash.com/photo-1571068316344-75bc76f77890?auto=format&fit=crop&w=1200&q=80', key: 'seed/nmax-2.jpg', alt: 'Scooter urbana', position: 1 },
      ]},
    }}),

    // 8. Honda CB 500F — Curitiba (Street)
    prisma.vehicle.create({ data: {
      ownerId: rafael.id, slug: 'honda-cb500f-2023-curitiba',
      title: 'Honda CB 500F ABS 2023', brand: 'Honda', model: 'CB 500F',
      year: 2023, plate: 'MOT3H23', city: 'Curitiba', state: 'PR',
      vehicleType: VehicleType.MOTORCYCLE, category: VehicleCategory.ECONOMY,
      transmission: Transmission.MANUAL, fuelType: FuelType.GASOLINE, seats: 2,
      dailyRate: 119.9, weeklyRate: 560, kmPolicy: 'FREE',
      motorcycleStyle: MotorcycleStyle.STREET, engineCc: 500, hasAbs: true,
      addressLine: 'Rua XV de Novembro, 341 — Centro',
      isPublished: true,
      description: 'Naked esportiva 500cc, leve e divertida. Ideal para quem quer experimentar uma moto média sem compromisso. ABS duplo canal, painel LCD. Perfeita para viagens no PR.',
      latitude: -25.4290, longitude: -49.2710,
      images: { create: [
        { url: 'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&w=1200&q=80', key: 'seed/cb500-1.jpg', alt: 'Honda CB street', position: 0 },
        { url: 'https://images.unsplash.com/photo-1609630875171-b1321377ee65?auto=format&fit=crop&w=1200&q=80', key: 'seed/cb500-2.jpg', alt: 'Moto naked', position: 1 },
      ]},
    }}),

    // 9. Fiat Pulse — Rio de Janeiro
    prisma.vehicle.create({ data: {
      ownerId: fernanda.id, slug: 'fiat-pulse-2023-rio-de-janeiro',
      title: 'Fiat Pulse Impetus 2023', brand: 'Fiat', model: 'Pulse',
      year: 2023, plate: 'RIO3P23', city: 'Rio de Janeiro', state: 'RJ',
      vehicleType: VehicleType.CAR, category: VehicleCategory.SUV,
      transmission: Transmission.AUTOMATIC, fuelType: FuelType.FLEX, seats: 5,
      dailyRate: 199.9, weeklyRate: 950, kmPolicy: 'FREE',
      addressLine: 'Avenida Atlântica, 1702 — Copacabana',
      isPublished: true,
      description: 'SUV compacto turbinado com design arrojado. Teto panorâmico, conectividade wireless e câmeras de assistência ao estacionamento. Ótimo para explorar o RJ.',
      latitude: -22.9680, longitude: -43.1770,
      images: { create: [
        { url: 'https://images.unsplash.com/photo-1580274455191-1c62238fa333?auto=format&fit=crop&w=1200&q=80', key: 'seed/pulse-1.jpg', alt: 'SUV compacto vermelho', position: 0 },
        { url: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=80', key: 'seed/pulse-2.jpg', alt: 'Crossover preto', position: 1 },
      ]},
    }}),

    // 10. Honda PCX — Rio de Janeiro (Scooter)
    prisma.vehicle.create({ data: {
      ownerId: fernanda.id, slug: 'honda-pcx-160-2024-rio-de-janeiro',
      title: 'Honda PCX 160 ABS 2024', brand: 'Honda', model: 'PCX 160',
      year: 2024, plate: 'MOT4H24', city: 'Rio de Janeiro', state: 'RJ',
      vehicleType: VehicleType.MOTORCYCLE, category: VehicleCategory.ECONOMY,
      transmission: Transmission.CVT, fuelType: FuelType.GASOLINE, seats: 2,
      dailyRate: 79.9, weeklyRate: 370, kmPolicy: 'FREE',
      motorcycleStyle: MotorcycleStyle.SCOOTER, engineCc: 160, hasAbs: true,
      addressLine: 'Avenida Atlântica, 1702 — Copacabana',
      isPublished: true,
      description: 'A scooter mais vendida do Brasil. Leve, econômica e prática para o trânsito carioca. Baú sob o banco (28L), USB para carregar o celular. Ideal para praia e cidade.',
      latitude: -22.9720, longitude: -43.1850,
      images: { create: [
        { url: 'https://images.unsplash.com/photo-1571068316344-75bc76f77890?auto=format&fit=crop&w=1200&q=80', key: 'seed/pcx-1.jpg', alt: 'Honda PCX prata', position: 0 },
        { url: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1200&q=80', key: 'seed/pcx-2.jpg', alt: 'Scooter cidade', position: 1 },
      ]},
    }}),

    // 11. Caoa Chery Tiggo 8 — Belo Horizonte (Van/SUV grande)
    prisma.vehicle.create({ data: {
      ownerId: camila.id, slug: 'caoa-chery-tiggo8-2023-belo-horizonte',
      title: 'Caoa Chery Tiggo 8 Pro 2023', brand: 'Caoa Chery', model: 'Tiggo 8 Pro',
      year: 2023, plate: 'BHZ3T23', city: 'Belo Horizonte', state: 'MG',
      vehicleType: VehicleType.CAR, category: VehicleCategory.SUV,
      transmission: Transmission.AUTOMATIC, fuelType: FuelType.FLEX, seats: 7,
      dailyRate: 319.9, weeklyRate: 1590, kmPolicy: 'FREE',
      addressLine: 'Avenida do Contorno, 8000 — Santo Antônio',
      isPublished: true,
      description: 'SUV 7 lugares com teto panorâmico duplo, sistema de som premium, câmeras 360° e assistente de estacionamento automático. Perfeito para família em viagem para o interior de MG.',
      latitude: -19.9200, longitude: -43.9380,
      images: { create: [
        { url: 'https://images.unsplash.com/photo-1519641471654-76ce0107ad5b?auto=format&fit=crop&w=1200&q=80', key: 'seed/tiggo-1.jpg', alt: 'SUV 7 lugares', position: 0 },
        { url: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=80', key: 'seed/tiggo-2.jpg', alt: 'SUV familiar', position: 1 },
        { url: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=1200&q=80', key: 'seed/tiggo-3.jpg', alt: 'Interior 7 lugares', position: 2 },
      ]},
    }}),
  ]);

  // Avaliações
  await prisma.review.createMany({ data: [
    { vehicleId: vehicles[1].id, authorId: fernanda.id, ownerId: lucas.id, rating: 5, comment: 'Carro impecável, econômico e entrega fácil. Super recomendo!' },
    { vehicleId: vehicles[0].id, authorId: lucas.id, ownerId: mariana.id, rating: 4, comment: 'Renegade ótimo para a viagem que fiz para o litoral. Atendimento excelente.' },
    { vehicleId: vehicles[2].id, authorId: lucas.id, ownerId: fernanda.id, rating: 5, comment: 'Corolla executivo muito bem conservado. Fernanda super atenciosa.' },
  ]});

  await prisma.userReview.createMany({ data: [
    { authorId: fernanda.id, targetUserId: lucas.id, rating: 5, comment: 'Devolução no prazo e carro impecável.' },
    { authorId: lucas.id, targetUserId: mariana.id, rating: 4, comment: 'Mariana responde rápido e é muito organizada.' },
    { authorId: lucas.id, targetUserId: fernanda.id, rating: 5, comment: 'Excelente proprietária, processo simples e rápido.' },
  ]});

  await prisma.$transaction([
    prisma.vehicle.update({ where: { id: vehicles[1].id }, data: { ratingAverage: 5, reviewsCount: 1 } }),
    prisma.vehicle.update({ where: { id: vehicles[0].id }, data: { ratingAverage: 4, reviewsCount: 1 } }),
    prisma.vehicle.update({ where: { id: vehicles[2].id }, data: { ratingAverage: 5, reviewsCount: 1 } }),
  ]);

  await prisma.notification.createMany({ data: [
    { userId: admin.id, type: NotificationType.SYSTEM_ALERT, title: 'Seed carregado', message: 'Ambiente populado com 11 veículos e 5 usuários.' },
  ]});

  await prisma.siteVisit.createMany({ data: [
    { visitorId: 'seed-v1', path: '/', referrer: 'https://google.com', userAgent: 'seed', isFirstVisit: true },
    { visitorId: 'seed-v2', path: '/search?q=suv', referrer: 'https://instagram.com', userAgent: 'seed', isFirstVisit: true },
    { visitorId: 'seed-v3', path: '/', userAgent: 'seed', isFirstVisit: true },
  ]});

  await invalidateVehicleCache();

  console.log(`Seed concluído: 11 veículos em SP, RJ, MG e PR. 5 usuários criados.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
