/**
 * SCHEMA: municipios
 * --------------------------------------------------------------------------
 * Esta é a tabela "esqueleto" do Atlas. Toda informação territorial (geometria,
 * nome, estado) vive aqui, UMA VEZ por município. Indicadores (MMGD, IVS, renda...)
 * NÃO ficam nesta tabela — eles ficam em tabelas próprias que apontam para esta
 * via o código IBGE (ver mmgd_indicadores.ts, ivs_indicadores.ts etc.).
 *
 * Por quê separar assim? Porque a geometria de um município praticamente nunca
 * muda (só em casos raros de redivisão territorial), enquanto indicadores como
 * MMGD mudam todo mês. Se misturássemos tudo numa tabela só, você reescreveria
 * a geometria inteira (que é "pesada") a cada atualização de qualquer indicador.
 * --------------------------------------------------------------------------
 */

import {
  pgTable,
  char,
  varchar,
  doublePrecision,
  timestamp,
  customType,
} from 'drizzle-orm/pg-core';

/**
 * Tipo customizado para geometria PostGIS.
 * --------------------------------------------------------------------------
 * O helper `geometry()` nativo do Drizzle, nesta versão, não respeita de forma
 * confiável o tipo geométrico + SRID passados (foi testado e gerou apenas
 * "geometry(point)" sem o SRID). Por isso, declaramos um customType que
 * controla exatamente o SQL gerado: geometry(MultiPolygon, 4674).
 *
 * Isso é mais seguro porque a coluna geom é a base de TODO o WebGIS — um SRID
 * errado faria o mapa desenhar os municípios na posição/escala erradas.
 */
const geometriaMultiPolygon = customType<{ data: string }>({
  dataType() {
    return 'geometry(MultiPolygon, 4674)';
  },
});

export const municipios = pgTable('municipios', {
  /**
   * Código IBGE de 7 dígitos. É a CHAVE PRIMÁRIA e também a "language comum"
   * que todas as outras tabelas (MMGD, IVS, renda...) vão usar para se conectar
   * a um município. Usamos char(7) — texto fixo, não número — porque alguns
   * códigos IBGE começam com zero e isso se perderia num tipo numérico.
   */
  codigoIbge: char('codigo_ibge', { length: 7 }).primaryKey(),

  /** Nome oficial do município, ex: "Belo Horizonte" */
  nome: varchar('nome', { length: 120 }).notNull(),

  /**
   * Sigla do estado (UF), ex: "MG", "SP". Guardamos aqui de forma redundante
   * (em vez de só ter uma tabela "estados" separada) porque o Atlas faz MUITAS
   * consultas do tipo "todos os municípios do estado X" (ver RF-030 do DRF) —
   * ter a UF direto na tabela evita um JOIN extra em toda consulta de ranking.
   */
  uf: char('uf', { length: 2 }).notNull(),

  /** Nome completo do estado, ex: "Minas Gerais" — evita outro JOIN para exibir na UI */
  nomeEstado: varchar('nome_estado', { length: 60 }).notNull(),

  /** Região do Brasil, ex: "Sudeste", "Nordeste" — útil para filtros regionais (RF-046) */
  regiao: varchar('regiao', { length: 20 }).notNull(),

  /**
   * A GEOMETRIA do município (o polígono que desenha seu contorno no mapa).
   * - Tipo 'MultiPolygon' porque alguns municípios têm ilhas/territórios separados
   *   (um Polygon simples não dá conta disso).
   * - SRID 4674 = SIRGAS 2000, o sistema de referência geodésico oficial do Brasil
   *   (confirmado: é o sistema usado pela Malha Municipal Digital do IBGE).
   * - Esta coluna é o que faz o sistema ser "WebGIS" de fato — é ela que o
   *   MapLibre vai ler para desenhar os contornos no choropleth (RF-021).
   */
  geom: geometriaMultiPolygon('geom').notNull(),

  /**
   * Área territorial em km², útil para cálculos de densidade (ex: MMGD por km²)
   * e também aparece nas publicações oficiais do IBGE como dado complementar.
   */
  areaKm2: doublePrecision('area_km2'),

  /** Quando este registro foi inserido/atualizado — útil para saber a "idade" da malha usada */
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * ÍNDICE ESPACIAL (GiST) — OBRIGATÓRIO conforme CLAUDE.md.
 * Sem este índice, toda consulta geográfica (ex: "qual município contém este ponto?",
 * "quais municípios estão dentro deste raio?") faria uma varredura completa da tabela,
 * o que é extremamente lento. O Drizzle ainda não tem uma forma 100% nativa de declarar
 * índices GiST diretamente no schema TypeScript — por isso, este índice é criado na
 * migration SQL (ver pasta migrations/, arquivo 0001_indices_espaciais.sql).
 *
 * Lembrete para quando você gerar a migration:
 *   CREATE INDEX idx_municipios_geom ON municipios USING GIST (geom);
 */
