-- Destaque via Asaas: txid (EfiPay) vira paymentId (id da cobrança Asaas) e a
-- chave PIX estática deixa de existir.
--
-- A tabela "FeaturedOrder" não consta em nenhuma migration anterior (nos
-- ambientes existentes ela veio do fallback `prisma db push` do Dockerfile).
-- Por isso o bloco é guardado: onde a tabela existe aplica tudo; onde não
-- existe (banco montado só por migrations) não faz nada em vez de abortar o
-- `migrate deploy` e derrubar o boot do container.
DO $$
BEGIN
  IF to_regclass('"FeaturedOrder"') IS NOT NULL THEN
    -- 1) Pedidos PENDING foram gerados pelo fluxo EfiPay/PIX estático e não
    --    podem mais ser confirmados: cancela para não ficarem órfãos.
    UPDATE "FeaturedOrder" SET "status" = 'CANCELLED' WHERE "status" = 'PENDING';

    -- 2) txid -> paymentId
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'FeaturedOrder' AND column_name = 'txid'
    ) THEN
      ALTER TABLE "FeaturedOrder" RENAME COLUMN "txid" TO "paymentId";
    END IF;

    -- 3) índice único acompanha o nome novo (padrão do Prisma)
    ALTER INDEX IF EXISTS "FeaturedOrder_txid_key" RENAME TO "FeaturedOrder_paymentId_key";

    -- 4) chave PIX estática removida
    ALTER TABLE "FeaturedOrder" DROP COLUMN IF EXISTS "pixKey";
  END IF;
END $$;
