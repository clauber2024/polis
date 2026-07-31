-- Migration 0031: tabela execucoes_etl
--
-- MOTIVACAO (sessao 30/07/2026): o Painel Admin so tinha status/metadados
-- manuais sobre as bases (migrations 0023/0024) - nenhum mecanismo disparava
-- a carga de dado de verdade pela interface (decisao explicita do RF-070,
-- ver CLAUDE.md). Usuario pediu um botao por base que dispara o extractor
-- Python de fato, nao so um registro manual - mudanca de decisao anterior,
-- registrada em docs/DECISOES.md, ADR "Disparo de ETL pela interface (RF-070
-- revisitado)".
--
-- Escopo desta primeira versao: so as bases 100% automaticas (sem
-- pre-requisito manual como gcloud/CSV/PDF baixado a mao) - ver whitelist em
-- backend/src/utils/extractoresElegiveis.ts. Cada execucao roda como
-- subprocesso Python a partir do backend Node (ver
-- backend/src/services/atualizacaoBases.service.ts), sem fila/agendador -
-- so 1 execucao por base_id por vez (UNIQUE PARCIAL abaixo bloqueia
-- concorrencia).
--
-- Granularidade: uma linha por EXECUCAO (nao por base) - historico completo,
-- nao so o ultimo status. saida_log guarda só a cauda do stdout/stderr (ver
-- LIMITE_LOG no service) - log completo nao e persistido, so o resumo final
-- que os extractors ja imprimem (contagem de sucesso/falha).

CREATE TABLE IF NOT EXISTS execucoes_etl (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,

  base_id varchar(60) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'em_execucao',

  iniciado_por_usuario_id integer REFERENCES usuarios(id) ON DELETE SET NULL,
  iniciado_em timestamp with time zone NOT NULL DEFAULT now(),
  finalizado_em timestamp with time zone,

  codigo_saida integer,
  saida_log text,

  CONSTRAINT execucoes_etl_status_valido
    CHECK (status IN ('em_execucao', 'sucesso', 'falha'))
);

-- Bloqueia duas execucoes simultaneas da MESMA base (indice parcial - so
-- olha linhas 'em_execucao'; nao impede rodar bases DIFERENTES em paralelo).
CREATE UNIQUE INDEX IF NOT EXISTS execucoes_etl_base_em_execucao_unica
  ON execucoes_etl (base_id)
  WHERE status = 'em_execucao';

CREATE INDEX IF NOT EXISTS idx_execucoes_etl_base_id ON execucoes_etl (base_id, iniciado_em DESC);

COMMENT ON TABLE execucoes_etl IS
  'Historico de disparos manuais de extractor Python pela interface do Painel Admin - RF-070 revisitado (30/07/2026, ver docs/DECISOES.md). So cobre a whitelist de bases 100% automaticas (backend/src/utils/extractoresElegiveis.ts); as demais fontes continuam exigindo execucao manual via terminal.';
COMMENT ON COLUMN execucoes_etl.base_id IS
  'Chave da whitelist em extractoresElegiveis.ts (ex.: mmgd_aneel, tarifa_distribuidoras) - nao e nome de arquivo nem input livre, sempre validado por enum no schema zod antes do INSERT.';
COMMENT ON COLUMN execucoes_etl.saida_log IS
  'Cauda do stdout+stderr do processo (ultimos ~8000 caracteres) - suficiente para o resumo final que todo extractor imprime ([N/M], [AVISO], contagem de sucesso/falha), nao o log inteiro.';
