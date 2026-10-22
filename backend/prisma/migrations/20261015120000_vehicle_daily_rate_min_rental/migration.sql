-- Preço por diária + tempo mínimo de aluguel.
--
-- Até aqui o preço que a tela mostrava era "weeklyRate ?? dailyRate" (rotulado
-- como "/semana"). Passa a existir só a diária real em "dailyRate"; a semana e o
-- mês viram estimativas calculadas no backend (diária x 7 e diária x 30).
--
-- Tudo roda numa única requisição multi-statement: o Postgres a executa como
-- uma transação implícita, então ou converte tudo ou não muda nada.

-- 1) Tempo mínimo de aluguel, em dias (NULL = sem mínimo). Os valores aceitos
--    (3, 7, 14, 30, 90) são validados no DTO, sem CHECK no banco.
ALTER TABLE "Vehicle" ADD COLUMN "minRentalDays" INTEGER;

-- 2) Converte o preço visível hoje (semanal) para diária. O COALESCE cobre
--    anúncios antigos sem "weeklyRate", cujo "dailyRate" era o que a tela
--    mostrava como "/semana".
UPDATE "Vehicle"
SET "dailyRate" = ROUND(COALESCE("weeklyRate", "dailyRate") / 7, 2);

-- 3) A coluna semanal deixa de existir.
ALTER TABLE "Vehicle" DROP COLUMN "weeklyRate";

-- 4) Alertas de busca: "minPrice"/"maxPrice" (valor semanal) viram
--    "minDailyRate"/"maxDailyRate" (valor diário = semanal / 7).
--    - O valor pode ser número JSON ou string numérica ('800'): "->>" devolve
--      texto nos dois casos e o regex só deixa passar texto numérico simples.
--    - Valor inválido (lixo, booleano, objeto, null): a chave é descartada e
--      nenhuma chave nova é criada para ela, em vez de derrubar a migration.
--    - O CASE sem ELSE devolve NULL para chave ausente/inválida e o
--      jsonb_strip_nulls (aplicado SÓ ao objeto novo, não ao filtro inteiro)
--      impede que apareça "minDailyRate": null.
--    - Zero é preservado (0 / 7 = 0.00 -> 0).
--    - trim_scale tira o ".00" do JSON (100.00 -> 100).
--    - O "queryHash" NÃO é recalculado (depende do código da aplicação).
UPDATE "SearchAlert"
SET "filters" = ("filters" - 'minPrice' - 'maxPrice') || jsonb_strip_nulls(
  jsonb_build_object(
    'minDailyRate',
    CASE
      WHEN ("filters" ->> 'minPrice') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$'
        THEN trim_scale(ROUND((("filters" ->> 'minPrice'))::numeric / 7, 2))
    END,
    'maxDailyRate',
    CASE
      WHEN ("filters" ->> 'maxPrice') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$'
        THEN trim_scale(ROUND((("filters" ->> 'maxPrice'))::numeric / 7, 2))
    END
  )
)
WHERE jsonb_typeof("filters") = 'object'
  AND ("filters" ? 'minPrice' OR "filters" ? 'maxPrice');
