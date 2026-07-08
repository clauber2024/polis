-- Migration 0019: criacao de indicadores_climaticos - primeiro indicador
-- climatico formal do Atlas (precipitacao maxima mensal, MERGE/CPTEC-INPE).
--
-- MOTIVACAO: linha de investigacao "Queima de equipamentos" (ARQUITETURA.md,
-- ideia registrada em 03/07/2026, ampliada para incluir chuva/vento por
-- decisao do usuario em 07/07/2026) testou clima x ressarcimento por danos
-- eletricos (ANEEL/INDGER) e confirmou sinal robusto para PRECIPITACAO em
-- escala nacional (rho parcial +0,19 controlando renda, robusto nas 5
-- regioes e 3 tercis de urbanizacao, 5.571 de 5.573 municipios) - ver
-- ARQUITETURA.md, secao "RESULTADO FINAL - COBERTURA NACIONAL" (08/07/2026).
-- Vento (ERA5/rajada) NAO foi formalizado - sinal enfraqueceu e ficou
-- inconsistente por regiao em escala nacional, permanece exploratorio em
-- backend/src/etl/analises/.
--
-- Tabela genuinamente periodica (mesmo espirito de mmgd_indicadores, NAO o
-- de indicadores_sociais onde cada coluna normalmente so tem valor em UM
-- periodo) - cada municipio tem um valor distinto de precipitacao a cada
-- mes. Valor armazenado e um MAXIMO ZONAL (todos os pixels de grade do
-- MERGE que tocam o poligono do municipio, all_touched=True), nao o pico de
-- 1 estacao - ver comentario na coluna e no schema Drizzle
-- (indicadores_climaticos.ts) para a explicacao metodologica completa.

CREATE TABLE "indicadores_climaticos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "indicadores_climaticos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"unidade_espacial_id" varchar(40) NOT NULL,
	"periodo_referencia" date NOT NULL,
	"precipitacao_max_mes_mm" double precision,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "indicadores_climaticos" ADD CONSTRAINT "indicadores_climaticos_unidade_espacial_id_unidades_espaciais_id_fk" FOREIGN KEY ("unidade_espacial_id") REFERENCES "public"."unidades_espaciais"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "indicadores_climaticos_unidade_periodo_idx" ON "indicadores_climaticos" USING btree ("unidade_espacial_id","periodo_referencia");

COMMENT ON COLUMN "indicadores_climaticos"."precipitacao_max_mes_mm" IS
  'Precipitacao maxima do mes (mm), zonal max (todos os pixels de grade do MERGE que tocam o poligono do municipio, all_touched=True), fonte MERGE/CPTEC-INPE (GPM-IMERG V07B + rede de pluviometros), grade 0.1 grau (~11km). NAO comparavel em magnitude ao pico de 1 estacao INMET - e maximo espacial+temporal sobre todo o territorio, nao de 1 ponto so. NULL quando nenhum dia do mes pode ser lido.';
