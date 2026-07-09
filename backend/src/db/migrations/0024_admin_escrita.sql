-- Migration 0024: tabelas do Painel Administrador (RF-068 a RF-077)
--
-- MOTIVACAO (sessao 08/07/2026): continuacao da migration 0023 (escrita do
-- Colaborador) - agora o papel Administrador. Decisao do usuario sobre
-- RF-070 ("upload, atualizacao e validacao de arquivos"): dado que a carga
-- real de dado SEMPRE passa pelos scripts Python (extrair_*.py, rodados
-- manualmente, fora da API Node - ver CLAUDE.md), esta migration implementa
-- SO o workflow/status (metadados + aprovacao + versionamento), NAO
-- recebimento de arquivo via API (isso ficaria em escopo futuro separado,
-- se algum dia for decidido).

-- RF-076: gestao de usuarios - status ativo/inativo na tabela ja existente
-- (migration 0022). Login (auth.service.ts) passa a checar este campo.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN usuarios.ativo IS
  'RF-076: usuario inativo nao consegue autenticar (ver auth.service.ts). Acao "remover" do RF-076 e feita via DELETE de verdade (ON DELETE CASCADE nas tabelas de escrita do Colaborador) - "inativar" e reversivel, "remover" nao.';

-- RF-071/072/073: metadados TECNICOS por base (granularidade espacial,
-- status de validacao) - diferente de revisoes_bases_dados (migration 0023,
-- Colaborador, revisao METODOLOGICA). base_dados usa os mesmos 6 IDs
-- canonicos, MAIS a linha especial 'aneel_mmgd_granularidade_fina' (RF-072,
-- ver seed abaixo) que nao e uma das 6 fontes, e sim o pedido pendente de
-- granularidade fina especifico da ANEEL/MMGD.
CREATE TABLE IF NOT EXISTS metadados_bases_dados (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  base_dados varchar(40) NOT NULL,
  granularidade_espacial varchar(20) NOT NULL DEFAULT 'municipio',
  status varchar(30) NOT NULL DEFAULT 'pendente',
  observacao text,
  atualizado_por_usuario_id integer REFERENCES usuarios(id) ON DELETE SET NULL,
  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT metadados_bases_dados_base_unica UNIQUE (base_dados),
  CONSTRAINT metadados_bases_dados_granularidade_valida
    CHECK (granularidade_espacial IN ('municipio', 'setor_censitario', 'cep', 'bairro', 'outro')),
  CONSTRAINT metadados_bases_dados_status_valido
    CHECK (status IN ('pendente', 'validado', 'erro', 'aguardando_liberacao'))
);

COMMENT ON TABLE metadados_bases_dados IS
  'RF-071/072/073: metadados tecnicos (granularidade espacial, status de validacao) mantidos pelo Administrador. Status TECNICO, nao confundir com revisoes_bases_dados (Colaborador, revisao metodologica, migration 0023).';

-- RF-074: fila de aprovacao de indicadores.
CREATE TABLE IF NOT EXISTS aprovacoes_indicadores (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  indicador varchar(120) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pendente',
  motivo text,
  criado_por_usuario_id integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  decidido_por_usuario_id integer REFERENCES usuarios(id) ON DELETE SET NULL,
  decidido_em timestamp with time zone,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT aprovacoes_indicadores_status_valido
    CHECK (status IN ('pendente', 'aprovado', 'rejeitado'))
);

COMMENT ON TABLE aprovacoes_indicadores IS
  'RF-074: fila de indicadores pendentes de aprovacao do Administrador, com acoes Aprovar/Rejeitar.';

-- RF-075: versionamento de mapas/dados publicados.
CREATE TABLE IF NOT EXISTS versoes_publicadas (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  versao varchar(40) NOT NULL,
  descricao text NOT NULL,
  publicado_por_usuario_id integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  publicado_em timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT versoes_publicadas_versao_unica UNIQUE (versao)
);

COMMENT ON TABLE versoes_publicadas IS
  'RF-075: controle de versionamento dos mapas/dados publicados (botao "Publicar nova versao").';

-- Seed: metadados das 6 bases canonicas (status tecnico inicial 'pendente',
-- granularidade 'municipio' - a mesma granularidade real de todos os
-- indicadores hoje) + a linha especial do RF-072.
INSERT INTO metadados_bases_dados (base_dados, granularidade_espacial, status, observacao) VALUES
  ('aneel', 'municipio', 'pendente', NULL),
  ('ibge', 'municipio', 'pendente', NULL),
  ('cadunico', 'municipio', 'pendente', NULL),
  ('tsee', 'municipio', 'pendente', 'Bloqueado - aguardando dado ANEEL pos-jan/2026 (nova subclasse Residencial Desconto Social). Ver CLAUDE.md.'),
  ('ivs_ipea', 'municipio', 'pendente', NULL),
  ('inpe', 'municipio', 'pendente', NULL),
  ('aneel_mmgd_granularidade_fina', 'setor_censitario', 'aguardando_liberacao',
   'RF-072: solicitacao em andamento junto a ANEEL para dado de MMGD em granularidade sub-municipal. Ver RF-045 (piloto ilustrativo, setores censitarios de Sao Paulo) e CLAUDE.md.')
ON CONFLICT (base_dados) DO NOTHING;
