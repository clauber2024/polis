-- Migration 0022: tabela usuarios - fundacao de autenticacao/RBAC
--
-- MOTIVACAO (sessao 08/07/2026): o DRF.md foi revisado na mesma sessao para
-- reduzir os 6 perfis originais (P1-P6) a 3 papeis reais de RBAC - ver DRF.md
-- Secao 2 e CLAUDE.md. So dois papeis autenticam de fato:
--   - colaborador  (funde os antigos P4 Parceiro Tecnico + P5 Equipe do Projeto)
--   - administrador (antigo P6)
-- O papel "publico" NAO tem linha nesta tabela - acessa as telas de
-- visualizacao sem autenticacao (ver DRF.md Secao 4, nota adicionada nesta
-- mesma revisao).
--
-- Escopo desta migration: so a fundacao (tabela + seed de demo). Os
-- endpoints de escrita que dependem disso (observacoes/sugestoes do
-- Colaborador, upload de base/aprovacao de indicador/gestao de usuario do
-- Administrador) continuam PLANEJADOS - ver CLAUDE.md, "Estado Real do
-- Projeto".

CREATE TABLE IF NOT EXISTS usuarios (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  nome varchar(120) NOT NULL,
  email varchar(160) NOT NULL,
  senha_hash text NOT NULL,
  papel varchar(20) NOT NULL,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT usuarios_email_unico UNIQUE (email),
  CONSTRAINT usuarios_papel_valido CHECK (papel IN ('colaborador', 'administrador'))
);

COMMENT ON TABLE usuarios IS
  'Contas autenticadas do Atlas - so os papeis Colaborador e Administrador (ver DRF.md Secao 2). O papel Publico nao tem linha aqui, nao autentica.';
COMMENT ON COLUMN usuarios.papel IS
  'Colaborador (funde antigos P4 Parceiro Tecnico + P5 Equipe do Projeto) ou administrador (antigo P6). Restrito via CHECK, nao enum do Postgres, para facilitar adicionar papel futuro sem migration de tipo.';
COMMENT ON COLUMN usuarios.senha_hash IS
  'Hash bcrypt (bcryptjs, custo 10) - nunca senha em texto puro. Ver backend/src/services/auth.service.ts.';

-- Seed das 2 contas de demonstracao (RT-005/RT-003 do DRF: "senha padrao
-- '123456' para todas as contas de demonstracao, restritas a ambiente de
-- prototipagem"). Hash gerado offline com bcryptjs (custo 10) para a senha
-- '123456' - idempotente via ON CONFLICT, entao rodar de novo so restaura a
-- senha demo caso alguem tenha trocado localmente.
INSERT INTO usuarios (nome, email, senha_hash, papel) VALUES
  ('Colaborador Demo', 'colaborador@atlassolarjusto.dev', '$2b$10$Beb8l5DiBWw0jOH/hLDpa.F2MM9xZeazNrQK./82OBURvYNeetuN6', 'colaborador'),
  ('Administrador Demo', 'admin@atlassolarjusto.dev', '$2b$10$Z1FWNlOSqoh6d2i2S5lB0.AzUkop0ACj1umwUK6DWSh2h6of2Fteu', 'administrador')
ON CONFLICT (email) DO UPDATE SET
  senha_hash = EXCLUDED.senha_hash,
  papel = EXCLUDED.papel;
