# DESAFIOS.md — Atlas Solar Justo

Registro de problemas recorrentes, limitações conhecidas e soluções validadas deste
projeto. Critério de quando registrar (e o que não registrar) está em `CLAUDE.md`,
seção "🔟 Fluxo de Trabalho do Assistente de IA" → "Memória e aprendizado".

## Distribuidoras "sem eixo de justiça" no ranking público — duas causas distintas, fácil confundir

**Contexto:**
`GET /api/ranking-distribuidoras` (ver `backend/src/services/rankingDistribuidoras.service.ts`)
cruza o dataset de fila de conexão MMGD da ANEEL (nomes de distribuidora livres,
`SigAgenteDistribuicao`) com o schema INDQUAL (`qualidade_conjuntos.sig_agente`,
nomenclatura própria) via crosswalk manual + automático
(`backend/src/etl/loaders/extrair_desempenho_conexao_mmgd.py`). Qualquer distribuidora
sem par no INDQUAL, ou cujos municípios atendidos não têm IVS calculável, cai em
`distribuidorasComDadosIncompletos`.

**Sintoma:**
Uma distribuidora aparece com `eixoJustica: null` / `ivsMedioPonderadoPorPopulacao: null`,
mesmo com `sig_agente_indqual` preenchido. Fácil concluir precipitadamente "é lacuna de
dado na fonte ANEEL/INDQUAL" (foi a primeira hipótese registrada, ver ARQUITETURA.md,
"Ideia de produto: ranking público de distribuidoras") sem checar a causa real.

**Causa confirmada:**
Duas causas bem diferentes, que produzem o MESMO sintoma:
1. **Nomenclatura**: o nome do dataset de fila de conexão é livre-texto e pode divergir
   MUITO do `sig_agente` real (ex.: "Forcel" → sigla real "PACTO ENERGIA PR", empresa
   incorporadora após aquisição em 2021; "Santa Maria" → "ELFSM"). O casamento automático
   (normalização + substring) não pega esses casos — precisa de pesquisa externa
   (histórico de aquisição, CNPJ) para confirmar, mesmo padrão já usado para
   Enel GO=EQUATORIAL GO.
2. **Área de concessão compartilhada** (causa mais comum na prática — 11 de 14 casos
   nesta investigação): a distribuidora É encontrada no INDQUAL e TEM municípios
   associados em `qualidade_conjunto_municipio`, mas TODOS esses municípios são
   TAMBÉM atendidos por outra distribuidora (típico de cooperativas/empresas municipais
   pequenas que servem só um bolsão dentro de um município majoritariamente coberto por
   uma concessionária maior). A regra de desambiguação (excluir município com >1
   `sig_agente` distinto — mesmo critério de `investigar_distribuidora_regioes_problema.py`)
   por isso zera 100% da cobertura dessas distribuidoras. **Isso é o comportamento
   CORRETO e intencional da regra**, não um bug nem lacuna de dado.

Confirmação exige consulta direta — "o sig_agente existe no INDQUAL" não basta para
descartar a causa 1, e "tem município associado" não basta para descartar a causa 2
(precisa checar se aquele(s) município(s) são EXCLUSIVOS ou compartilhados).

**Solução validada:**
Script de diagnóstico dedicado, somente leitura:
`backend/src/etl/analises/investigar_cobertura_indqual_ranking_distribuidoras.py` —
para cada distribuidora suspeita, conta municípios associados (descarta causa "conjunto
sem município"), depois conta quantos `sig_agente` distintos cobrem cada um desses
municípios (confirma ou refuta causa 2), e busca candidatos de nome por `ILIKE` no nome
completo (não só o primeiro token — buscar só "Santa" ou "João" traz ruído demais) para
a causa 1.

**Prevenção:**
Antes de registrar uma distribuidora como "sem dado por limitação da fonte", rodar o
script de diagnóstico acima (ou o mesmo padrão de consulta) — não assumir a partir do
sintoma isolado. Ao adicionar uma distribuidora nova ao `MAPEAMENTO_MANUAL_CONFIRMADO`
de `extrair_desempenho_conexao_mmgd.py`, documentar a fonte externa da confirmação
(mesmo padrão já usado: CNPJ, histórico de aquisição, perfil da empresa) — nunca supor
por semelhança de nome sozinha.

**Arquivos ou componentes relacionados:**
`backend/src/services/rankingDistribuidoras.service.ts`,
`backend/src/etl/loaders/extrair_desempenho_conexao_mmgd.py`,
`backend/src/etl/analises/investigar_cobertura_indqual_ranking_distribuidoras.py`,
ARQUITETURA.md ("Ideia de produto: ranking público de distribuidoras").

---

## Modelo para novos registros

## <Nome do desafio>

**Contexto:**
Onde e quando o problema ocorre.

**Sintoma:**
Como o problema aparece.

**Causa confirmada:**
Qual era a causa real — ou "hipótese, ainda não confirmada" se for o caso.

**Solução validada:**
O que resolveu o problema.

**Prevenção:**
Como evitar que volte a acontecer.

**Arquivos ou componentes relacionados:**
Lista curta de referências relevantes.
