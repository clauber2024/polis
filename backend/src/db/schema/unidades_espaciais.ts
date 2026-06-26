/**
 * SCHEMA: unidades_espaciais
 * --------------------------------------------------------------------------
 * ESTA É A CORREÇÃO DO PROBLEMA: "como funciona a chave quando a granularidade
 * é menor que município?"
 *
 * O QUE MUDOU EM RELAÇÃO À VERSÃO ANTERIOR:
 * Antes, as tabelas de indicador (mmgd_indicadores, indicadores_sociais...)
 * tinham uma foreign key fixa para `municipios.codigo_ibge`, e um campo extra
 * "granularidade_codigo" de texto livre, sem nenhuma garantia de que aquele
 * código realmente existisse ou tivesse geometria. Era um remendo, não uma
 * modelagem de verdade.
 *
 * AGORA: criamos uma tabela "guarda-chuva", `unidades_espaciais`, que pode
 * representar QUALQUER nível de granularidade — município, setor censitário,
 * CEP, bairro, ou outro — todos com geometria própria e um ID único de verdade.
 * As tabelas de indicador passam a apontar para `unidades_espaciais.id`,
 * não mais diretamente para `municipios.codigo_ibge`.
 *
 * Cada município SEMPRE tem um registro correspondente aqui (criado junto com
 * o registro em `municipios`, no momento do seed inicial). Um setor censitário
 * só vai ter um registro aqui no dia em que esse dado existir de fato.
 *
 * POR QUE NÃO SUBSTITUIR `municipios` POR ESTA TABELA?
 * Porque município tem atributos próprios que setor censitário/CEP não têm
 * (UF, nome do estado, região — usados nos filtros RF-046 e no ranking
 * estadual RF-027 a RF-037). Por isso `municipios` continua existindo como
 * tabela própria, mas agora ela TAMBÉM aparece referenciada dentro de
 * `unidades_espaciais`, formando a ponte entre as duas.
 * --------------------------------------------------------------------------
 */

import {
  pgTable,
  varchar,
  char,
  doublePrecision,
  timestamp,
  customType,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { municipios } from './municipios';

/**
 * Geometria genérica — aqui usamos 'Geometry' (não 'MultiPolygon' como em
 * municipios.ts) porque uma unidade espacial pode, no futuro, ser representada
 * por um ponto (ex: um CEP pode ser modelado como ponto central) ou por um
 * polígono (setor censitário, bairro). 'Geometry' aceita qualquer tipo.
 */
const geometriaGenerica = customType<{ data: string }>({
  dataType() {
    return 'geometry(Geometry, 4674)';
  },
});

export const unidadesEspaciais = pgTable(
  'unidades_espaciais',
  {
    /**
     * ID PRÓPRIO E ESTÁVEL — esta é a chave que resolve o problema original.
     * Não é mais um texto livre não verificado; é uma chave primária real,
     * que as tabelas de indicador vão referenciar via foreign key de verdade.
     */
    id: varchar('id', { length: 40 }).primaryKey(),
    // Convenção de formato do ID (definida pela aplicação, não pelo banco):
    //   município           -> "municipio:3106200"               (código IBGE)
    //   setor censitário     -> "setor_censitario:355030885000123" (código IBGE do setor)
    //   CEP                  -> "cep:01310100"
    //   bairro                -> "bairro:3550308:moema"            (código IBGE do município + slug do bairro)
    // O prefixo antes do ":" sempre repete o campo "tipo" abaixo — isso facilita
    // leitura humana de logs e debugging, sem precisar fazer JOIN para saber o que é.

    /**
     * O tipo de granularidade que este registro representa.
     * Mesma lista de valores que já estava prevista no DRF (RF-038, RF-042):
     * 'municipio' | 'setor_censitario' | 'cep' | 'bairro' | 'outro'
     */
    tipo: varchar('tipo', { length: 20 }).notNull(),

    /**
     * Código "natural" da unidade, na nomenclatura da fonte original
     * (ex: o código de 15 dígitos do setor censitário do IBGE). Fica separado
     * do "id" porque o id tem o prefixo de tipo embutido — este campo guarda
     * só o código puro, útil para conferir contra a fonte original.
     */
    codigoOriginal: varchar('codigo_original', { length: 40 }).notNull(),

    /**
     * Nome legível para exibir na interface (RF-044: "rótulo da unidade
     * espacial... lido do metadado", não fixo no texto da UI).
     * Ex: "Moema" para um bairro, "Setor 355030885000123" para um setor censitário.
     */
    nomeExibicao: varchar('nome_exibicao', { length: 150 }).notNull(),

    /**
     * Liga esta unidade ao município "pai" — TODA unidade espacial, seja ela
     * o próprio município, um setor censitário, CEP ou bairro, está dentro
     * de um município. Isso é o que permite, por exemplo, fazer o drill-down
     * do RF-043 ("Ver detalhamento interno"): buscar todas as unidades_espaciais
     * com municipioPaiCodigoIbge = 'X' e tipo = 'setor_censitario'.
     */
    municipioPaiCodigoIbge: char('municipio_pai_codigo_ibge', { length: 7 })
      .notNull()
      .references(() => municipios.codigoIbge, { onDelete: 'cascade' }),

    /** Geometria própria desta unidade espacial */
    geom: geometriaGenerica('geom').notNull(),

    areaKm2: doublePrecision('area_km2'),

    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (tabela) => ({
    /**
     * Garante que não existam duas unidades com o mesmo tipo + código original
     * dentro do mesmo município (evita duplicar o mesmo setor censitário, por
     * exemplo, se o ETL rodar duas vezes).
     */
    tipoMunicipioCodigoUnico: uniqueIndex('unidades_espaciais_tipo_municipio_codigo_idx').on(
      tabela.tipo,
      tabela.municipioPaiCodigoIbge,
      tabela.codigoOriginal,
    ),
  }),
);

/**
 * ÍNDICE GiST — assim como em municipios.ts, este índice precisa ser criado
 * manualmente na migration SQL, porque o Drizzle não gera índices espaciais
 * automaticamente:
 *   CREATE INDEX idx_unidades_espaciais_geom ON unidades_espaciais USING GIST (geom);
 */
