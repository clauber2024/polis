CREATE TABLE "municipios" (
	"codigo_ibge" char(7) PRIMARY KEY NOT NULL,
	"nome" varchar(120) NOT NULL,
	"uf" char(2) NOT NULL,
	"nome_estado" varchar(60) NOT NULL,
	"regiao" varchar(20) NOT NULL,
	"geom" geometry(MultiPolygon, 4674) NOT NULL,
	"area_km2" double precision,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unidades_espaciais" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"tipo" varchar(20) NOT NULL,
	"codigo_original" varchar(40) NOT NULL,
	"nome_exibicao" varchar(150) NOT NULL,
	"municipio_pai_codigo_ibge" char(7) NOT NULL,
	"geom" geometry(Geometry, 4674) NOT NULL,
	"area_km2" double precision,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mmgd_indicadores" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mmgd_indicadores_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"unidade_espacial_id" varchar(40) NOT NULL,
	"periodo_referencia" date NOT NULL,
	"potencia_instalada_kw" double precision NOT NULL,
	"numero_ucs_com_mmgd" integer NOT NULL,
	"total_ucs_municipio" integer,
	"e_dado_ilustrativo" varchar(5) DEFAULT 'false' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indicadores_sociais" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "indicadores_sociais_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"unidade_espacial_id" varchar(40) NOT NULL,
	"periodo_referencia" date NOT NULL,
	"ivs" double precision,
	"renda_media_domiciliar" double precision,
	"percentual_cadunico" double precision,
	"percentual_tarifa_social" double precision,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "irradiacao_solar" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "irradiacao_solar_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"codigo_ibge" char(7) NOT NULL,
	"periodo_referencia" date NOT NULL,
	"irradiacao_media_kwh_m2_dia" double precision NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "unidades_espaciais" ADD CONSTRAINT "unidades_espaciais_municipio_pai_codigo_ibge_municipios_codigo_ibge_fk" FOREIGN KEY ("municipio_pai_codigo_ibge") REFERENCES "public"."municipios"("codigo_ibge") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmgd_indicadores" ADD CONSTRAINT "mmgd_indicadores_unidade_espacial_id_unidades_espaciais_id_fk" FOREIGN KEY ("unidade_espacial_id") REFERENCES "public"."unidades_espaciais"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicadores_sociais" ADD CONSTRAINT "indicadores_sociais_unidade_espacial_id_unidades_espaciais_id_fk" FOREIGN KEY ("unidade_espacial_id") REFERENCES "public"."unidades_espaciais"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irradiacao_solar" ADD CONSTRAINT "irradiacao_solar_codigo_ibge_municipios_codigo_ibge_fk" FOREIGN KEY ("codigo_ibge") REFERENCES "public"."municipios"("codigo_ibge") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unidades_espaciais_tipo_municipio_codigo_idx" ON "unidades_espaciais" USING btree ("tipo","municipio_pai_codigo_ibge","codigo_original");--> statement-breakpoint
CREATE UNIQUE INDEX "mmgd_unidade_periodo_idx" ON "mmgd_indicadores" USING btree ("unidade_espacial_id","periodo_referencia");--> statement-breakpoint
CREATE UNIQUE INDEX "indicadores_sociais_unidade_periodo_idx" ON "indicadores_sociais" USING btree ("unidade_espacial_id","periodo_referencia");--> statement-breakpoint
CREATE UNIQUE INDEX "irradiacao_municipio_periodo_idx" ON "irradiacao_solar" USING btree ("codigo_ibge","periodo_referencia");