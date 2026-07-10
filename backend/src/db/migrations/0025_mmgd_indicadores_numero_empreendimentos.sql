-- Migration 0025: numero_empreendimentos em mmgd_indicadores
--
-- MOTIVACAO (sessao 10/07/2026, construcao do endpoint GET /api/estatisticas-nacionais
-- para a Landing Page, RF-005): ao investigar o pedido do usuario de expor "numero de
-- sistemas MMGD conectados" e "pessoas beneficiadas por creditos de energia", foi
-- confirmado (inspecao real do Parquet bruto ANEEL/MMGD, ver ARQUITETURA.md secao
-- "RF-005") que `numero_ucs_com_mmgd` (coluna ja existente) NUNCA representou
-- "sistemas/instalacoes conectados" - o extractor sempre somou QtdUCRecebeCredito
-- (numero de UCs BENEFICIADAS por credito de energia, que pode exceder 1 por
-- empreendimento em modalidade Compartilhada/Auto consumo remoto), nao contou linhas.
-- Isso significa que o card "Sistemas MMGD conectados" da landing estava com o
-- ROTULO ERRADO (o numero em si sempre esteve certo, so descrito de forma enganosa).
--
-- `extrair_mmgd_aneel.py` ja calcula a contagem real de instalacoes via
-- `df.groupby("codigo_ibge").agg(numero_empreendimentos=("codigo_ibge", "count"))`,
-- mas esse valor era descartado antes do INSERT (nunca chegava a ser persistido).
-- Esta migration adiciona a coluna para o extractor passar a gravar esse numero de
-- verdade, permitindo separar as duas metricas: instalacoes conectadas (esta coluna)
-- vs UCs beneficiadas por credito (numero_ucs_com_mmgd, ja existente).

ALTER TABLE mmgd_indicadores
  ADD COLUMN IF NOT EXISTS numero_empreendimentos integer;

COMMENT ON COLUMN mmgd_indicadores.numero_empreendimentos IS
  'Numero de empreendimentos (instalacoes/sistemas) de MMGD conectados - COUNT de linhas do Parquet ANEEL por municipio, TOTAL (todas as classes de consumo). Diferente de numero_ucs_com_mmgd (SUM de QtdUCRecebeCredito, UCs BENEFICIADAS por credito, pode ser maior que o numero de instalacoes em modalidade Compartilhada/Auto consumo remoto). NULL para snapshots carregados antes da migration 0025 (extrator precisa rodar novamente).';
