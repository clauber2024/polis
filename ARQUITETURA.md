# ARQUITETURA.md — Estado Atual e Decisões de Dados
> Complemento ao [`CLAUDE.md`](./CLAUDE.md) (padrões técnicos) e ao [`README.md`](./README.md).
> Este documento cobre o que muda com frequência: estado dos dados, decisões de fontes
> e fila de trabalho. Padrões de código, banco e Git estão no CLAUDE.md — não duplicar aqui.
> Última atualização: 03/07/2026.
## Estado dos dados (pós-sessão de INDQUAL, jul/2026)
⚠️ README e CLAUDE.md (29/06) estão desatualizados em relação ao abaixo.
Tabela `unidades_espaciais`:
- 5.573 municípios (`municipio:<codigo_ibge>`)
- 12.348 FCUs — Favelas e Comunidades Urbanas como unidades espaciais próprias
  (tipo `favela_comunidade_urbana`; coluna `tipo` expandida para VARCHAR(40))
- 3.696 ZEIS/AEIS em 4 capitais: RJ 1.044, SP 2.574, Recife 76, Rio Branco 2
| Dimensão | Status | Notas |
|---|---|---|
| Território | ✅ | IBGE Malha 2025, 5.573 municípios |
| MMGD | ✅ | ANEEL jun/2026: 5.567 mun., 50.086 MW, 8M UCs |
| Infraestrutura Urbana | ✅ | Censo 2022/SIDRA, 5.570 mun., 5 indicadores |
| Renda e Trabalho | ✅ | RAIS 2024 via BigQuery, 5.571 mun. |
| Moradia | ✅ **Finalizada jul/2026** | Regime de ocupação (Censo) + FCU + ZEIS/AEIS + inadequação (% parede) + MCMV/FGTS (5.111 mun., 36,6M UH) + MCMV/OGU (4.883 mun., 1,7M UH) |
| Qualidade de Fornecimento | ✅ **Finalizada jul/2026** | INDQUAL/ANEEL: DEC/FEC + 21 variantes por origem de interrupção, ~4,9M registros. Conjunto elétrico → município é N:N (42.661 pares); view resolve por pior-caso e média |
| Capital Humano | 🟡 Parcial | Alfabetização ok; falta DATASUS (mortalidade infantil) |
| Irradiação Solar | ⏳ | INPE, não iniciado |
## Decisões de fontes (confirmadas por pesquisa, jul/2026)
- **BDGD**: pública no Portal de Dados Abertos ANEEL desde 2022 (não precisa LAI).
  Limitação real: arquivos `.gdb` por distribuidora, pesados, sem API nacional.
  FIC/DIC individual por UC pode estar no BDO separado, ou via LAI para cruzamentos
  específicos. UGBT/UGMT da BDGD tem MMGD georreferenciada (útil para cruzamentos sub-municipais).
- **INDQUAL** (Qualidade de Fornecimento) — **confirmado e carregado, jul/2026**: dataset
  ANEEL *"Indicadores Coletivos de Continuidade (DEC e FEC)"*, granularidade **Conjunto
  Elétrico** (não é shapefile — 3 CSVs relacionais via `dadosabertos.aneel.gov.br`):
  `atributos` (metadado do conjunto), `indicadores-continuidade-coletivos-2020-2029`
  (valores, formato longo — 23 siglas carregadas, não só DEC/FEC), `indqual-municipio`
  (de-para conjunto↔município, chave `IdeConjUnidConsumidoras`/`IdeConjUndConsumidoras` —
  nome de coluna diverge entre arquivos). Relação conjunto↔município é **N:N**
  (um conjunto pode cobrir vários municípios e vice-versa) — schema usa tabela de
  junção própria (`qualidade_conjunto_municipio`) + view (`vw_qualidade_municipio`)
  que agrega por **pior-caso** (MAX) como padrão, com média disponível para referência.
  6 códigos IBGE da fonte não existem em `municipios` (padrão `*9999`/`*9922` — massas
  d'água/sem-município, esperado e ignorado no ETL).
- **TSEE / baixa renda** (indicador alvo: `percentual_tsee`): usar dataset ANEEL
  **"Beneficiários da CDE"** (`dadosabertos.aneel.gov.br/dataset/beneficiarios-da-cde`),
  não os shapefiles UCBT. Lei 15.235/2025 ("Luz do Povo") criou a subclasse
  "Residencial Desconto Social" — extractors devem capturar **duas subclasses**:
  "Residencial Baixa Renda" E "Residencial Desconto Social".
- **Censo 2022**: sem dado utilizável de acesso à eletricidade — excluído do Eixo 4.
- **OBEPE**: referência metodológica (Índice de Pobreza Energética Regional), não fonte
  primária — ver `docs/DRF.md` seção 14.
## Fila de trabalho
1. **Beneficiários da CDE** — testar endpoint, extractor de `percentual_tsee`
2. **Irradiação Solar** — INPE
3. **Cruzamento MMGD × indicadores sociais** — identificar vazios reais de acesso
4. **Capital Humano** — DATASUS, mortalidade infantil
5. Atualizar README e CLAUDE.md (Estado Real) com os dados das sessões de Moradia e INDQUAL
## Manutenção deste documento
Atualizar ao fim de cada sessão de carga de dados: estado da `unidades_espaciais`,
tabela de dimensões e fila de trabalho. Decisões de fontes só mudam com nova pesquisa.