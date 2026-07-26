
# Auditoria de consistência, anexo técnico e materiais de apoio — Atlas Solar Justo

**Nota sobre a origem deste documento.** O texto abaixo foi produzido a partir de três materiais do projeto Atlas Solar Justo: `docs/RELATORIO_AUDITORIA_MORADIA_SOLAR.md` (auditoria técnica do banco de dados e da metodologia), `docs/SUMARIO_EXECUTIVO_MORADIA_ENERGIA_SOLAR.md` (síntese voltada a tomadores de decisão) e, incorporado numa segunda rodada de revisão, o **rascunho do relatório principal** — `Atlas das experiências de MMGD solar: Caminhos para democratizar o acesso à energia solar distribuída no Brasil` (arquivo `.docx`, Instituto Pólis, versão ainda com lacunas de redação marcadas "xx" e data de capa em aberto) —, complementados por trechos de `ARQUITETURA.md` e `docs/DECISOES.md` quando necessário para esclarecer um procedimento citado nos demais. **Não foram localizadas, em nenhum dos materiais, Notas Metodológicas 1/2/3 individualizadas, arquivos de mapas/gráficos/tabelas prontos (além dos que o próprio rascunho do relatório principal referencia como "Figura X", ainda sem o objeto correspondente produzido), nem uma lista de referências bibliográficas formal.** Onde a tarefa original pedia a verificação de um dado que simplesmente não consta em nenhum dos materiais disponíveis, isso é sinalizado com as marcações combinadas ([informação a confirmar] etc.), nunca preenchido por inferência.

**Achado relevante da incorporação do relatório principal:** o rascunho atual do relatório principal **já contém, integralmente, a metodologia e os resultados dos três instrumentos como uma seção do corpo do texto** ("PARTE III – A Lente Territorial e Estrutural do Atlas Solar Justo", com subseções "1. A Matriz de 'Vazios de Acesso'", "2. O Descompasso Morfológico", "3. O IVSH" e "4. Resultados Ineficientes de Crédito: o Caso do Reforma Casa Brasil Solar") — exatamente o conteúdo que a decisão editorial desta tarefa pede para mover a um anexo, substituindo-o no corpo por uma síntese com referência. Isso é tratado como uma pendência editorial concreta no Bloco 1 e no Bloco 5 abaixo, com o texto de substituição já redigido e pronto para uso.

---

## BLOCO 1 — Diagnóstico de consistência dos materiais

Lista de inconsistências, lacunas e afirmações que exigem revisão, identificadas na leitura cruzada dos dois documentos-fonte antes da redação do anexo.

### 1.1 Inconsistências numéricas confirmadas (erro de cálculo ou de transcrição)

1. **Diferença percentual de intensidade financeira incorreta.** `RELATORIO_AUDITORIA_MORADIA_SOLAR.md` (Achado 2, Seção 3.3) afirma que o valor per capita em Vazios de Acesso (R$ 1.410,93/1.000 hab.) é "31% menor" que em municípios de "Adoção acima do potencial" (R$ 2.441,27/1.000 hab.). O recálculo direto a partir dos mesmos dois valores — (2.441,27 − 1.410,93) / 2.441,27 — resulta em **42,2%**, não 31%. A segunda comparação do mesmo parágrafo ("30% menor que em Acesso pleno", R$ 2.033,24) está correta: (2.033,24 − 1.410,93) / 2.033,24 = 30,6%. **[revisão estatística necessária]** — mantido no anexo com o valor recalculado e a divergência explicitada, não substituído silenciosamente.
2. ~~**Denominador divergente para "municípios sem contrato" dentro do mesmo relatório.**~~ **[RESOLVIDO em 26/07/2026, por investigação direta no banco local]** A tabela de distribuição por quadrante (Seção 3.3-A) usa n = 4.476 para municípios sem contrato do Reforma Casa Brasil Solar. A tabela de precariedade habitacional (Seção 3.3-C, "Base completa") usa n = 4.480 para o mesmo grupo, no mesmo documento — diferença de exatamente 4 municípios. **Causa raiz confirmada**: a tabela A opera sobre o universo "classificável" de Vazios de Acesso (5.569 municípios, que exige dado de irradiação solar), enquanto a tabela C (precariedade habitacional) opera sobre o universo completo de municípios do banco (5.573), que não depende de irradiação. A diferença de 4 é exatamente os 4 municípios sem dado de irradiação no Atlas INPE 2017, confirmados por consulta direta (`irradiacao_solar`): Fernando de Noronha (PE), Boa Esperança do Norte (MT, código 5101837, desmembrado de Sorriso/Nova Ubiratã em 2025) e dois polígonos de corpo d'água tratados como unidade territorial na malha do IBGE — "Área Operacional Lagoa Mirim" e "Área Operacional Lagoa dos Patos" (RS, códigos 4300001/4300002). Mesma causa raiz do item 4 abaixo (universo do IVSH).
3. ~~**Escala do Índice de Segurança da Posse não reconciliada entre as duas descrições que o próprio material fornece.**~~ **[RESOLVIDO em 26/07/2026]** `RELATORIO_AUDITORIA_MORADIA_SOLAR.md` definia o índice, na migration 0014, com pesos próprio = 1,0 / alugado = 0,5 / cedido = 0,0, sem explicitar a escala resultante. Já a fórmula do IVSH, no mesmo documento, usa o termo `1 − indice_seguranca_posse/100` — o que só faz sentido se o valor armazenado estiver em escala 0–100 — e a tabela de quintis do Sumário Executivo (Seção 6.4) exibe valores entre 53,99 e 97,31, consistentes com uma escala 0–100. **Confirmado por inspeção direta do código**: o comentário da migration `0028_view_ivsh_consolidado.sql` declara explicitamente "`indice_seguranca_posse` (migration 0014) e POSITIVO (0 a 100, maior = melhor)" — os pesos da migration 0014 são aplicados sobre percentuais de domicílio armazenados em escala 0–100, não sobre uma escala fracionária. A escala real é **0–100**. `RELATORIO_AUDITORIA_MORADIA_SOLAR.md` foi corrigido na mesma data para explicitar isso.
4. ~~**Universo "5.570" vs. "5.569" vs. "5.573" usado em três lugares diferentes sem nota unificadora.**~~ **[RESOLVIDO em 26/07/2026, por investigação direta no banco local]** O Sumário Executivo cita "~5.570 municípios" como cobertura nacional geral (aproximação desatualizada); a Matriz de Vazios de Acesso e a auditoria do Reforma Casa Brasil Solar operam sobre uma base de **5.569** municípios "classificáveis"; o IVSH foi calculado para **5.573** municípios. **Causa raiz confirmada por consulta direta ao banco e ao shapefile-fonte**: a tabela `municipios` tem hoje **5.573 linhas** — não 5.570 —, número que bate exatamente com a contagem de feições do shapefile-fonte `BR_Municipios_2025.shp` (verificado via `geopandas`, sem nenhum `CD_MUN` duplicado). "~5.570" é uma aproximação desatualizada em relação à malha municipal 2025 usada pelo seed do projeto (que já reflete municípios criados/desmembrados mais recentemente, ex.: Boa Esperança do Norte/MT). O universo de **5.569 classificáveis** é 5.573 menos os 4 municípios sem dado de irradiação solar (ver item 2, acima) — não, como o relatório original supôs, por município(s) pendente(s) de reextração de MMGD (checado ao vivo no endpoint `GET /api/vazios-de-acesso`: `totalPrecisaReextrairMmgd` está em **0** hoje; o campo real responsável pela exclusão é `totalExcluidosSemDado = 4`, por ausência de irradiação, não de MMGD — a explicação anterior estava desatualizada). O IVSH (5.573) simplesmente usa o universo completo da tabela `municipios`, sem excluir os 4 municípios sem irradiação (o IVSH não depende de irradiação) — não há município duplicado, extinto ou espúrio na base.

### 1.2 Divergência entre narrativa e evidência estatística (a mais relevante para o rigor do anexo)

5. **O "Padrão 2 — Alta verticalização" do Descompasso Morfológico é apresentado nos dois documentos-fonte como um padrão estabelecido de barreira à adoção solar, mas o único teste quantitativo direto da variável correlata (`percentual_apartamento`, Tabela SIDRA 9928) encontrado nos materiais aponta na direção oposta.** `ARQUITETURA.md` (seção "Índices compostos e metodologia de cruzamentos", achado de 06/07/2026) reporta que, controlando por renda, o coeficiente parcial de `percentual_apartamento` sobre a adoção de MMGD residencial foi **positivo** (+0,115 a +0,156, a depender da variante), contrariando a hipótese "mais apartamento = menos telhado próprio = menos adoção". A interpretação registrada no próprio material é que `percentual_apartamento` funciona mais como proxy de porte/modernidade urbana do que como medida limpa de barreira física ao telhado individual. Nenhum dos dois documentos-fonte do anexo (Relatório de Auditoria, Sumário Executivo) menciona esse resultado ao apresentar a "alta verticalização" como segundo padrão de descompasso morfológico. **[inconsistência a esclarecer] / [revisão estatística necessária]** — o anexo trata a verticalização como hipótese conceitual ainda não confirmada estatisticamente, não como padrão validado, e relata o sinal contrário encontrado.
6. **Não foi localizado, em nenhum dos materiais, um critério de corte formal (ex.: "mais de 50% dos domicílios do tipo apartamento") usado para classificar municípios em "alta verticalização", nem uma contagem de municípios classificados sob esse critério, nem distribuição regional, nem análise de sensibilidade do corte.** A variável `percentual_apartamento` aparece nos materiais apenas como covariável de controle em testes exploratórios de outliers regionais (Sul e Centro-Oeste), nunca como eixo de uma classificação binária de "descompasso por verticalização" com um limiar definido. O corte de 50% citado na tarefa original **não foi encontrado nos materiais** e não deve ser apresentado como se existisse. **[procedimento a confirmar] / [teste de sensibilidade não realizado]**.
7. **Nenhum dos quatro municípios citados como exemplo de descompasso morfológico (Uiramutã, Jaboatão dos Guararapes, Cabo de Santo Agostinho, Olinda) está associado, nos materiais, ao padrão de verticalização — todos são citados como exemplos do Padrão 1 (precariedade construtiva).** O anexo preserva essa atribuição correta e não infere exemplos para o Padrão 2, que não existem nos materiais.

### 1.3 Lacunas de granularidade (dado agregado apresentado sem o detalhe que a tarefa original pedia)

8. Valores individuais de índice de precariedade habitacional para Jaboatão dos Guararapes, Cabo de Santo Agostinho e Olinda **não são informados separadamente** — apenas um intervalo conjunto (0,15 a 0,22). **[informação a confirmar]**.
9. Valores individuais de índice de precariedade e de IVSH para Aldeias Altas, Buriti e Mirador (MA) **não são informados separadamente** — apenas um intervalo conjunto (0,13 a 0,15) para precariedade, e nenhum valor de IVSH individual para esses três municípios especificamente (eles não aparecem na lista dos cinco municípios de maior IVSH). **[informação a confirmar]**.
10. IVSH individual, posição no ranking e eventual ocorrência de empates **não são informados** para nenhum município além do "top 5" citado nominalmente. **[resultado não informado]**.
11. Para a variável Segurança da Posse: os materiais não especificam se o indicador computa apenas domicílios próprios/alugados/cedidos ou se também incorpora ocupações/irregularidade fundiária; não especificam o denominador exato (total de domicílios recenseados no município, presumivelmente, mas isso não está explicitado). **[informação a confirmar]**.
12. Não há, nos materiais, indicação de que os valores financeiros do Reforma Casa Brasil Solar (R$ 61,4 milhões) estejam em termos nominais ou corrigidos por algum índice; não há data exata de extração dos dados (apenas o período coberto, nov/2025–abr/2026, e a data de referência da sessão de auditoria, 18/07/2026, que não é necessariamente a data de extração); não há informação sobre registros excluídos, contratos cancelados/duplicados ou municípios sem identificação de código IBGE. **[informação a confirmar]** em todos os itens.
13. Não há, nos materiais, nenhum teste de sensibilidade às medianas nacionais usadas como corte da Matriz de Vazios de Acesso, nem aos pesos do IVSH (que são, pelos materiais disponíveis, pesos iguais — média simples dos três componentes —, mas não há teste alternativo de ponderação), nem tratamento formal de autocorrelação espacial ou dependência espacial nos testes de correlação parcial. **[teste de sensibilidade não realizado]**.
14. A região que diverge no sinal da correlação parcial controlada por renda e irradiação simultaneamente (4 de 5 regiões mantêm o sinal, para as duas variáveis de moradia) **não é identificada nominalmente** nos materiais referentes ao teste formal (migration `0029`) — os autores registram explicitamente que a exceção "não foi diagnosticada nesta sessão". Um teste bivariado anterior e metodologicamente distinto (controle apenas por renda, sem irradiação) havia identificado a região Sul como divergente para Segurança da Posse, e essa linha de investigação foi formalmente encerrada por decisão do usuário sem explicação encontrada — mas os materiais não confirmam que se trata da mesma divergência do teste final de três variáveis de controle. **[informação a confirmar]**.

### 1.4 Linguagem que exige suavização antes de entrar no anexo

15. O termo **"ortogonalidade"** é usado em `RELATORIO_AUDITORIA_MORADIA_SOLAR.md` para descrever a relação entre precariedade habitacional e a classificação de Vazio de Acesso, sem nenhum teste estatístico de ortogonalidade/independência entre as duas variáveis — apenas uma comparação descritiva de percentuais. O termo foi removido do anexo e substituído por linguagem descritiva ("dimensões que não coincidem sistematicamente", sem reivindicar independência estatística formal).
16. Expressões como "prova", "confirma definitivamente" e "isso demonstra... que são dimensões parcialmente independentes" (Sumário Executivo, Seção 4.3) foram suavizadas no anexo para refletir o alcance real de uma comparação de percentuais — não um teste de hipótese formal de independência.
17. A afirmação "O Instituto Pólis desenvolveu e validou um novo instrumento" (Sumário Executivo, abertura) foi mantida, mas qualificada: os próprios materiais (Seção 8.1 do Sumário Executivo) esclarecem que IVSH e Vazio de Acesso são "construções metodológicas originais... ainda não submetidas a validação externa por pares" — o anexo usa "validação interna" para não sugerir revisão por pares que não ocorreu.
18. O "Achado 3" da auditoria do Reforma Casa Brasil Solar afirma correlação com precariedade habitacional "na direção que o desenho do programa sugeriria" sem apresentar teste estatístico de significância para essa diferença de médias (0,0259 vs. 0,0153 e 0,0281 vs. 0,0186) — os materiais não informam desvio-padrão, mediana ou teste de hipótese, só as médias. O anexo apresenta a diferença como descritiva, não como resultado estatisticamente testado. **[revisão estatística necessária]**.

### 1.5 Achados da incorporação do relatório principal (rascunho `.docx`)

22. **O título da própria seção do relatório principal que trata do Reforma Casa Brasil Solar afirma o que o restante do texto pede para não afirmar.** A seção se chama "4. Resultados Ineficientes de Crédito: o Caso do Reforma Casa Brasil Solar" — usando "ineficientes" no título, quando os objetivos e critérios oficiais do programa só foram parcialmente localizados nesta auditoria (ver item 23) e nunca foram confrontados sistematicamente com a distribuição observada. Isso contraria a orientação de linguagem da própria tarefa ("evite... 'o programa falha'") e vai além do que a auditoria descritiva sustenta. **Recomenda-se renomear a seção** — por exemplo, "Aderência territorial do crédito: o caso do Reforma Casa Brasil Solar" — antes da publicação.
23. **Os critérios de elegibilidade do programa, que esta auditoria havia marcado como "a confirmar", aparecem parcialmente no relatório principal (Parte II, Tabela 1) e não haviam sido citados nos dois documentos-fonte usados na primeira rodada desta auditoria.** O texto descreve o Reforma Casa Brasil (do qual "Reforma Casa Brasil Solar" é a modalidade com componente solar) como "voltada para famílias com renda familiar bruta mensal de até R$ 9.600" e "pode ser solicitado por moradores de áreas urbanas, mesmo sem a escritura do imóvel ou com o financiamento em andamento". Isso resolve parcialmente a pendência "objetivos e critérios oficiais do programa a confirmar" (Seção 14.9 e Quadro 5) — mas não informa metas territoriais, existência de focalização ativa, condições de crédito (juros, prazo) ou período de maturação esperado, que continuam **[a confirmar]**.
24. **A mesma imprecisão de "cerca de 30%" identificada no Bloco 1, item 1, está presente no próprio texto do relatório principal, não apenas nos materiais internos de auditoria.** O trecho "R$ 1.410,93 por 1.000 habitantes, cerca de 30% menos que nos municípios de acesso pleno (R$ 2.033,24) ou de adoção acima do potencial (R$ 2.441,27)" aplica um único percentual aproximado a duas comparações que, recalculadas, são 30,6% e 42,2% respectivamente. **Os dois documentos-fonte internos (`RELATORIO_AUDITORIA_MORADIA_SOLAR.md`, `SUMARIO_EXECUTIVO_MORADIA_ENERGIA_SOLAR.md`) já foram corrigidos em 26/07/2026.** O rascunho do relatório principal (`Atlas das experiências de MMGD solar...docx`) é um arquivo externo a este repositório — a correção do trecho citado ali continua pendente (Quadro 5) até que o arquivo seja localizado e editado. **[revisão estatística necessária — pendente só no rascunho externo]**.
25. **O termo "ortogonal"**, sinalizado no Bloco 1, item 15, para os materiais internos, **também aparece no relatório principal** ("essa correlação é ortogonal ao eixo que define Vazio de Acesso"), sem teste estatístico de ortogonalidade. A recomendação de suavização (Seção 14.7 do anexo) aplica-se diretamente ao texto que será publicado, não apenas aos bastidores.
26. **O achado de sinal invertido da variável de segurança da posse da terra (ρ parcial = −0,2976, oposto ao hipotetizado) não aparece em nenhum lugar do relatório principal.** O texto cita apenas o coeficiente da precariedade habitacional ("p ≈ 2,7×10⁻³⁰... sinal consistente em quatro das cinco regiões do país") ao afirmar robustez estatística da Matriz e do IVSH — sem mencionar que um segundo teste, sobre uma variável usada no próprio IVSH, produziu resultado na direção oposta à esperada. Isso reforça a recomendação do Bloco 6, achado 5: omitir esse resultado do texto publicado, embora ele apareça nos materiais internos de auditoria, é uma escolha editorial que reduz a transparência que o próprio relatório principal reivindica em sua seção de recomendações ("Dados, transparência e desenvolvimento metodológico").
27. **O relatório principal confirma, e não contradiz, a leitura de que a hipótese de "alta verticalização" carece de sustentação estatística direta** — o texto a descreve apenas qualitativamente ("municípios com muitos prédios e condomínios, onde a barreira não é a precariedade, mas a necessidade de uma decisão coletiva"), sem números, sem corte, sem contagem de municípios e sem menção ao sinal positivo encontrado no teste exploratório de `percentual_apartamento` (Bloco 1, item 5). A ausência de números nesse trecho é, na prática, consistente com a lacuna identificada — o relatório principal não afirma algo que os dados contradizem, apenas não testa a hipótese que enuncia.
28a. **O relatório principal tem dois cabeçalhos "PARTE III" distintos** — "PARTE III – A Lente Territorial e Estrutural do Atlas Solar Justo" (metodologia e resultados dos três instrumentos) e, logo em seguida, "PARTE III – Evidências Empíricas" (casos ilustrativos). A segunda deveria ser "PARTE IV", com a renumeração em cascata das partes seguintes ("Percepções de Especialistas" passaria de IV para V, e "Recomendações" de V para VI) — ou, alternativamente, a solução recomendada no Bloco 5 (mover a metodologia/resultados para o anexo) resolve isso naturalmente, porque a atual "Parte III – Lente Territorial" deixaria de existir como parte numerada do corpo do texto. **[revisão editorial necessária]**.
28. **A Parte II do relatório principal está incompleta** (marcações "xx" para número de linhas de financiamento levantadas e percentuais, data de capa em aberto, seção "Casos internacionais" da Parte III textualmente ausente e sinalizada como pendente pelo próprio texto, nomes de revisores em aberto) — o documento é, no estado em que foi encontrado, um rascunho de trabalho, não uma versão final pronta para diagramação. Qualquer edição proposta neste anexo (Bloco 5) deve ser entendida como uma peça a mais desse processo de fechamento, não como alteração de um texto já finalizado.

### 1.6 Fontes e afirmações não verificáveis com os materiais disponíveis

19. Nenhum arquivo de mapa, gráfico ou tabela pronta foi localizado — todas as recomendações de figura no Bloco 4 abaixo são recomendações do que **poderia** ser produzido a partir dos dados já descritos nos materiais, não figuras já existentes.
20. Nenhuma lista de referências bibliográficas foi localizada. O Bloco 2 cita apenas as fontes de dados mencionadas nos materiais (ANEEL, IBGE/Censo 2022, INPE/LABREN, RAIS, CadÚnico) — sem inventar publicações acadêmicas ou institucionais que não constam nos materiais-fonte.
21. Os "objetivos oficiais, público-alvo e critérios de elegibilidade" do programa Reforma Casa Brasil Solar, pedidos como pré-requisito da auditoria de aderência territorial, **não constam em nenhum dos materiais disponíveis** — apenas a origem do dado (extrato do Sistema de Informação ao Cidadão da Caixa Econômica Federal) e o período coberto. **[objetivos e critérios oficiais do programa a confirmar]**.

---

## BLOCO 2 — Anexo técnico consolidado

**Título sugerido:**

> Anexo Técnico — Metodologia, Resultados Empíricos e Auditoria Territorial dos Instrumentos de Justiça Energética do Atlas Solar Justo

*(Texto a seguir, pronto para copiar e colar como anexo do relatório do Atlas Solar Justo.)*

### 1. Apresentação

Este anexo reúne, num único documento, a metodologia, os resultados empíricos e a auditoria de política pública que sustentam três instrumentos analíticos desenvolvidos pelo Instituto Pólis no âmbito do Atlas Solar Justo: a Matriz de Vazios de Acesso, o Descompasso Morfológico e o Índice de Vulnerabilidade Sócio-Habitacional-Energética (IVSH). O corpo principal do relatório apresenta apenas a síntese dos achados mais relevantes desses instrumentos (ver Bloco 6); este anexo é a referência técnica completa, para quem precisar verificar como cada número foi produzido, quais decisões metodológicas foram tomadas e onde estão os limites de cada leitura.

A opção por separar metodologia e resultados detalhados do corpo do relatório é editorial, não uma forma de reduzir o rigor: cada afirmação quantitativa do relatório principal que se apoia nestes instrumentos deve ser rastreável até uma seção específica deste anexo (ver Quadro 4, de rastreabilidade). Onde os materiais disponíveis no momento da redação não permitiram confirmar um número, um procedimento ou uma fonte, isso é sinalizado explicitamente — o anexo não completa lacunas por inferência.

Os três instrumentos foram construídos com dados públicos (ANEEL, IBGE/Censo 2022, INPE/LABREN, RAIS, CadÚnico) e uma fonte não pública fornecida por solicitação formal de acesso à informação (extrato do Reforma Casa Brasil Solar, Caixa Econômica Federal). São, pelos próprios materiais que os descrevem, construções metodológicas **originais e pioneiras** do Instituto Pólis — sem equivalente direto em outro observatório de energia do país —, e por isso **ainda não submetidas a validação externa por pares**. Essa condição deve acompanhar qualquer comunicação institucional dos resultados.

### 2. Objetivos da análise

**Objetivo geral:** verificar se, e em que medida, a condição de moradia — precariedade construtiva, tipologia habitacional e segurança da posse da terra — funciona como uma barreira ao acesso à energia solar fotovoltaica residencial no Brasil, independentemente da renda e do potencial de irradiação disponíveis, e avaliar se o principal programa de crédito habitacional com componente solar identificado (Reforma Casa Brasil Solar) prioriza os territórios onde essa barreira é mais aguda.

**Objetivos específicos:**
- Classificar os municípios brasileiros segundo a relação entre potencial de irradiação solar e adoção residencial de energia solar distribuída (Matriz de Vazios de Acesso).
- Identificar territórios onde a morfologia construtiva das moradias (precariedade física ou tipologia habitacional) pode limitar fisicamente a instalação individual de sistemas fotovoltaicos (Descompasso Morfológico).
- Combinar vulnerabilidade social geral, precariedade habitacional e insegurança da posse da terra num índice único de priorização territorial (IVSH).
- Testar estatisticamente se a precariedade habitacional e a insegurança da posse têm associação própria com a adoção de MMGD residencial, controlando renda e irradiação.
- Auditar a distribuição territorial dos contratos e recursos do Reforma Casa Brasil Solar frente aos três instrumentos acima.

**Fenômenos analisados:** disponibilidade do recurso solar; apropriação da tecnologia fotovoltaica em nível residencial; condição física e tipológica da moradia; vulnerabilidade social; segurança da posse da terra; e o desenho territorial efetivo de um programa de crédito habitacional com componente solar.

### 3. Perguntas analíticas

**Matriz de Vazios de Acesso:** em quais municípios o potencial solar é alto mas a adoção residencial permanece baixa? Essa concentração territorial reflete algum padrão regional ou institucional identificável?

**Descompasso Morfológico:** em quais territórios a morfologia construtiva das moradias — precariedade física ou tipologia — pode representar uma limitação física à instalação individual de sistemas fotovoltaicos, distinta de uma barreira puramente econômica?

**IVSH:** que municípios apresentam vulnerabilidade elevada quando se combinam, num único indicador, a condição social geral, a precariedade da moradia e a insegurança da posse — e esse conjunto coincide com os municípios identificados pela Matriz de Vazios de Acesso?

**Leitura integrada:** os três instrumentos captam a mesma vulnerabilidade territorial, ou dimensões parcialmente distintas? Que tipologia territorial emerge de sua combinação?

**Auditoria do Reforma Casa Brasil Solar:** a distribuição de contratos e recursos do programa coincide com os territórios identificados como prioritários pelos três instrumentos acima?

### 4. Referencial conceitual

**Vazio de Acesso** — classificação municipal relativa (não um limiar físico ou universal) que identifica municípios cujo potencial de irradiação solar está acima da mediana nacional, mas cuja adoção residencial de energia solar distribuída, normalizada por população, está abaixo da mediana nacional. Capta o descolamento entre potencial físico e conversão efetiva em adoção. Não mede, isoladamente, a causa desse descolamento (pode refletir renda, moradia, tarifa, fila de conexão, ou combinação de fatores) — é um instrumento de localização territorial de prioridade, não de diagnóstico causal.

**Descompasso Morfológico** — situação em que a morfologia construtiva das moradias de um território pode impedir, ou dificultar, a instalação individual de um sistema fotovoltaico residencial, independentemente de crédito, tarifa ou informação disponíveis. Os materiais descrevem duas hipóteses de padrão: precariedade construtiva (paredes inadequadas, cortiços, presença de favelas/comunidades urbanas) e alta verticalização (proporção elevada de domicílios em apartamento). A primeira hipótese tem indicadores municipais associados e casos ilustrativos nos materiais; a segunda é, nos materiais disponíveis, uma hipótese conceitual ainda não sustentada por um teste estatístico direto — ver Seção 10.3 e Quadro 4 para o detalhe dessa distinção. O conceito não permite, isoladamente, afirmar que uma edificação individual específica é incapaz de receber painéis — apenas que os indicadores agregados do município sugerem maior probabilidade de limitações físicas, fundiárias, financeiras ou decisórias para a instalação individual.

**Índice de Vulnerabilidade Sócio-Habitacional-Energética (IVSH)** — métrica composta que combina, num único número por município, a vulnerabilidade social geral (índice já existente no Atlas, sem componente habitacional), a precariedade física da moradia e a insegurança da posse da terra. Criado para responder a uma pergunta que nenhum dos indicadores isolados do Atlas respondia: em que município a vulnerabilidade é mais aguda quando as três dimensões são olhadas ao mesmo tempo. Não é, pelos próprios materiais, equivalente ao Índice de Vulnerabilidade Social (IVS) tradicional, que por decisão de desenho **exclui** moradia.

**Justiça energética**, nos termos em que os materiais empregam a expressão, é o reconhecimento de que o acesso à transição energética depende de condições que vão além da disponibilidade do recurso natural e da renda — incluindo a condição física e jurídica da moradia como pré-condição de acesso, não apenas mais um indicador social entre outros.

**Barreiras de acesso**, no desenho dos materiais, são tratadas em pelo menos três camadas distintas — física (a edificação comporta a tecnologia?), econômica (a família pode financiar a instalação?) e fundiária (a posse é segura o suficiente para justificar o investimento?) —, sem que os materiais estabeleçam uma hierarquia causal entre elas; a evidência estatística disponível (Seção 12) testa associação, não peso causal relativo.

**O que cada conceito não mede:** nenhum dos três instrumentos mede, em nível de domicílio individual, se um telhado específico comporta ou não um sistema fotovoltaico; nenhum incorpora inspeção física de moradias; nenhum estabelece causalidade entre a condição habitacional e a não adoção solar — apenas associação estatística, após os controles empregados.

### 5. Arquitetura integrada da análise

Os três instrumentos foram desenhados para captar dimensões complementares, não redundantes, da mesma pergunta central — por que a irradiação e a renda disponíveis nem sempre se convertem em adoção solar residencial:

- **Disponibilidade do recurso** — irradiação solar média (INPE/LABREN), eixo comum à Matriz de Vazios de Acesso e ao Descompasso Morfológico.
- **Apropriação da tecnologia** — MMGD residencial per capita (ANEEL), eixo de resposta da Matriz de Vazios de Acesso e variável dependente dos testes de correlação parcial.
- **Condição física da moradia** — índice de precariedade habitacional (Censo IBGE 2022 + FCU/IBGE), eixo do Descompasso Morfológico (Padrão 1) e um dos três componentes do IVSH.
- **Tipologia urbana** — percentual de domicílios em apartamento (Censo IBGE 2022, Tabela SIDRA 9928), hipótese conceitual de um segundo padrão de Descompasso Morfológico, ainda não confirmada estatisticamente pelos materiais disponíveis (ver Seção 10.3).
- **Vulnerabilidade social** — Índice de Vulnerabilidade Social consolidado do Atlas (infraestrutura urbana, renda e trabalho, capital humano), um dos três componentes do IVSH, por desenho sem componente habitacional.
- **Segurança da posse** — índice construído a partir da proporção de domicílios próprios/alugados/cedidos, componente do IVSH e variável testada estatisticamente na Seção 12.
- **Capacidade de acesso a políticas** — auditoria da distribuição territorial do Reforma Casa Brasil Solar frente aos instrumentos acima (Seção 14).

Os resultados não convergem de forma automática entre os três instrumentos — e essa não convergência é, em si, um achado relevante, tratado na Seção 13. Um município pode ter IVSH elevado sem ser Vazio de Acesso (porque o IVSH não depende de irradiação); pode ser Vazio de Acesso sem precariedade habitacional relevante (porque o corte é bivariado, irradiação × adoção, sem controle de moradia); e pode ter alta verticalização sem que isso, pelos dados disponíveis, represente uma barreira à adoção.

### 6. Universo, unidade de análise e recortes

A unidade de análise em todos os três instrumentos é o **município** (~5.570 municípios brasileiros no total nacional). Não há, nos materiais, leitura confiável em nível de bairro, setor censitário ou domicílio individual em escala nacional — um piloto de setor censitário existe apenas para o município de São Paulo, e é, pelos próprios materiais, **sintético**: distribui um total municipal real proporcionalmente pela área de uma grade artificial, não uma medição real desagregada, e não deve ser usado para nenhuma conclusão sobre desigualdade intramunicipal.

O universo efetivamente classificado pela Matriz de Vazios de Acesso é de **5.569 municípios** — o total real da tabela `municipios` (**5.573**, confirmado com o shapefile-fonte `BR_Municipios_2025.shp`, sem duplicatas) menos os 4 municípios sem dado de irradiação solar no Atlas INPE 2017 (Fernando de Noronha/PE, Boa Esperança do Norte/MT, e dois polígonos de corpo d'água da malha do IBGE — "Área Operacional Lagoa Mirim" e "Lagoa dos Patos", RS), exposto como aviso `totalExcluidosSemDado` na resposta da API — checado ao vivo em 26/07/2026 (`totalPrecisaReextrairMmgd` está zerado hoje; a exclusão por reextração pendente de MMGD, citada em versões anteriores deste anexo, não é mais a causa). O IVSH foi calculado para **5.573 municípios** — o universo completo, sem a exclusão por irradiação, porque o IVSH não depende desse dado. **[RESOLVIDO em 26/07/2026]**.

Os materiais não mencionam tratamento específico para Fernando de Noronha ou Distrito Federal nos três instrumentos deste anexo — ambos aparecem, em outras partes do Atlas (fora do escopo direto deste anexo), como casos de ausência justificada de dado de irradiação solar, mas essa nota não foi verificada especificamente para os instrumentos aqui descritos. **[informação a confirmar]**.

Os períodos de referência divergem por fonte: irradiação solar é uma climatologia de 1999–2015 (INPE/LABREN); os dados de moradia e tipologia habitacional são do Censo IBGE 2022; a MMGD residencial (ANEEL) reflete um snapshot acumulado, sem data de referência única explicitada neste anexo além de "dado mais recente disponível no momento da classificação"; os dados do Reforma Casa Brasil Solar cobrem novembro de 2025 a abril de 2026. Essa diferença temporal entre fontes é uma limitação estrutural, tratada na Seção 18.

### 7. Fontes de dados

| Fonte | Base | Ano ou período | Variáveis | Escala | Aplicação | Limitações |
|---|---|---|---|---|---|---|
| INPE/LABREN-CCST | Atlas Brasileiro de Energia Solar | Climatologia 1999–2015 | Irradiação Global Horizontal média anual | Municipal | Eixo de potencial solar (Matriz de Vazios de Acesso, Descompasso Morfológico, controle estatístico) | Climatologia histórica, não medição em tempo real; não capta variação interanual recente |
| ANEEL | Microdados de MMGD (classe residencial) | Snapshot mais recente disponível | Potência residencial instalada, número de UCs residenciais | Municipal (normalizado por 1.000 hab.) | Eixo de adoção (Matriz de Vazios de Acesso, variável dependente dos testes estatísticos) | Snapshot acumulado, não série temporal; população municipal é estimada, não contagem direta de censo |
| IBGE — Censo 2022 | Tabela SIDRA (paredes, tipo de domicílio 9928, condição de ocupação) | 2022 | Paredes inadequadas, percentual de apartamento, propriedade/aluguel/cessão | Municipal | Índice de precariedade habitacional; hipótese de verticalização; índice de segurança da posse | Mede material construtivo e tipologia, não o Déficit Habitacional oficial (Fundação João Pinheiro) |
| IBGE/FCU — Cadastro Nacional de Favelas e Comunidades Urbanas | Favelas e Comunidades Urbanas | Não especificado nos materiais | Número e percentual de população em favela/comunidade urbana | Municipal | Componente do índice de precariedade habitacional | Cobertura e metodologia de identificação de FCU não detalhadas nos materiais deste anexo |
| RAIS | Renda média domiciliar | Não especificado nos materiais | Renda média domiciliar | Municipal | Variável de controle nos testes de correlação parcial | Período exato não citado nos materiais deste anexo |
| Caixa Econômica Federal (SIC) | Extrato do programa Reforma Casa Brasil Solar | nov/2025–abr/2026 | Número de contratos, valor liberado | Municipal (agregado) | Auditoria de aderência territorial (Seção 14) | Fonte não pública, não automatizável; agregado único por município, sem chave de indivíduo/contrato; sem série temporal |

Fontes citadas nos materiais que não puderam ser detalhadas neste quadro por falta de informação suficiente (ano/período exato, variável exata): CadÚnico e DATASUS são mencionados no enunciado da tarefa original, mas **não aparecem citados nos dois documentos-fonte efetivamente localizados** como parte destes três instrumentos específicos — não incluídos no quadro para não sugerir uso que não está documentado. **[fonte a confirmar]**.

### 8. Preparação e compatibilização dos dados

Os materiais disponíveis documentam, de forma dispersa, algumas decisões de tratamento de dado relevantes para este anexo, mas não descrevem um pipeline de preparação específico para os três instrumentos aqui tratados. O que é possível afirmar com base no que está documentado:

- A normalização da potência residencial por 1.000 habitantes usa população municipal estimada por densidade populacional × área territorial (IBGE) — não uma contagem direta de censo. Todos os valores per capita e por 1.000 habitantes citados neste anexo herdam essa margem de aproximação.
- O corte de quadrante da Matriz de Vazios de Acesso usa **mediana**, não média, como limiar — decisão explícita registrada nos materiais para lidar com distribuições assimetricamente concentradas (poucos municípios grandes distorceriam uma média).
- Indicadores têm direção (favorável/desfavorável) tratada no cálculo da classificação, sem inverter o valor exibido — a lógica de quadrante considera a direção internamente, mas o número apresentado ao leitor é sempre o valor bruto.
- Os componentes do índice de precariedade habitacional (percentual de cortiço, percentual de parede inadequada, percentual de população em favela) são normalizados em escala min–max nacional, resultando numa distribuição fortemente assimétrica à direita — a maioria dos municípios tem valores próximos de zero, e os casos mais extremos chegam a 0,33–0,39 (ver Seção 17 para a implicação disso na leitura de médias).
- Não há, nos materiais, descrição de deflacionamento de valores financeiros, tratamento de valores extremos (outliers) nos indicadores per capita, ou compatibilização temporal explícita entre as fontes de diferentes períodos além do que já foi citado na Seção 6. **[procedimento a confirmar]** nesses pontos.

### 9. Matriz de Vazios de Acesso

#### 9.1 Definição conceitual

Ver Seção 4. A Matriz classifica cada município num de quatro quadrantes, cruzando duas medianas nacionais: irradiação solar acima/abaixo da mediana, e adoção residencial de MMGD (per capita) acima/abaixo da mediana.

#### 9.2 Construção dos eixos

Eixo X (potencial): Irradiação Global Horizontal média anual climatológica, INPE/LABREN, referência 1999–2015. Eixo Y (adoção): potência residencial de MMGD (ANEEL, classe residencial filtrada dos microdados), normalizada por 1.000 habitantes, usando população municipal estimada.

#### 9.3 Critérios de classificação

Um município é classificado como **Vazio de Acesso** quando sua irradiação está **acima** da mediana nacional **e** sua adoção residencial per capita está **abaixo** da mediana nacional. Os demais três quadrantes são definidos pela combinação inversa de cada eixo (ver Quadro 9.6 abaixo).

#### 9.4 Justificativa das medianas

A mediana foi escolhida em vez da média porque as distribuições de irradiação e, sobretudo, de adoção per capita são assimétricas — municípios de grande porte e forte cultura de adoção cooperativa (caso do Sul do país, ver Seção 9.6) distorceriam uma média nacional. O uso de per capita, e não de valor absoluto de potência instalada, evita que a classificação favoreça cidades grandes independentemente da taxa real de adoção — decisão explícita registrada nos materiais.

#### 9.5 Resultados nacionais

Mediana nacional de irradiação: **5,02 kWh/m²/dia** (o dado de maior precisão localizado nos materiais internos do projeto, `ARQUITETURA.md`, registra 5,015 kWh/m²/dia — diferença de arredondamento, não de fonte). Mediana nacional de adoção residencial: **111,3 kW por 1.000 habitantes** (111,29 kW/1.000 hab. na fonte de maior precisão). Sobre a base de 5.569 municípios classificáveis:

| Quadrante | Municípios | % do total classificável |
|---|---:|---:|
| Vazio de Acesso (irradiação alta, adoção baixa) | 1.451 | 26,1% |
| Acesso pleno (irradiação alta, adoção alta) | 1.334 | 24,0% |
| Baixo potencial, baixa adoção (irradiação baixa, adoção baixa) | 1.333 | 23,9% |
| Adoção acima do potencial (irradiação baixa, adoção alta) | 1.451 | 26,1% |

*(Percentuais recalculados diretamente sobre 5.569 nesta auditoria; conferem com a soma exata dos quatro grupos.)*

#### 9.6 Distribuição regional

O Vazio de Acesso é fortemente concentrado no Nordeste: **1.123 dos 1.451 municípios classificados como Vazio de Acesso (77,4% do total nacional) estão no Nordeste**, e **62,6% de todos os municípios da região Nordeste** são Vazio de Acesso — a maior proporção regional do país (Sudeste 13,8%, Centro-Oeste 13,3%, Norte 8,0%). A região Sul apresenta **0% de Vazios de Acesso**: 71,9% dos municípios sulistas (857 de 1.191) estão classificados como "Adoção acima do potencial" — adoção superior ao que o potencial físico isolado sugeriria, padrão que os materiais associam a fatores institucionais (cultura cooperativista de crédito rural, renda e vínculos formais mais altos), sem testar formalmente essa atribuição neste anexo.

Um teste exploratório adicional, dentro do Nordeste, comparou municípios atendidos pelo grupo de distribuidoras Equatorial (Maranhão, Piauí, Alagoas; n=543) com o restante da região (n=1.251): a adoção residencial mediana do grupo Equatorial (69,86 kW/1.000 hab.) é inferior à do restante (79,14 kW/1.000 hab.), e a proporção de Vazio de Acesso é maior (70,2% vs. 59,3%), **apesar de potencial solar mediano praticamente idêntico** (5,455 vs. 5,477 kWh/m²/dia) **e renda mediana domiciliar maior** no grupo Equatorial (R$ 2.898 vs. R$ 2.722). Esse resultado é descritivo (comparação de medianas, sem teste de significância formal reportado nos materiais) e não deve ser lido como prova de causalidade institucional — mas é consistente com um padrão já observado em outra região do país (Centro-Oeste) e mencionado nos materiais como não plenamente explicado. **[revisão estatística necessária]** caso se deseje reportar este achado com significância formal.

Ressalva metodológica registrada nos próprios materiais e preservada neste anexo: a classificação de Vazio de Acesso é um **corte bivariado simples** (irradiação × adoção, sem controle de renda). Parte da concentração no Nordeste pode refletir o gargalo de renda já documentado nacionalmente (Seção 12), não apenas potencial solar "desperdiçado" por barreira habitacional. Isso não invalida a classificação para fins de priorização territorial — mas deve acompanhar qualquer leitura que atribua a concentração regional exclusivamente à condição de moradia.

#### 9.7 Casos territoriais

Ver Seção 10.7 (os casos territoriais documentados nos materiais são apresentados como exemplos de Descompasso Morfológico, e não foram descritos de forma independente para a Matriz de Vazios de Acesso além da classificação de quadrante).

#### 9.8 Limitações

A Matriz é uma classificação **relativa**, construída a partir da distribuição nacional observada — não um limiar físico ou universal de viabilidade solar. Um "Vazio de Acesso" não é, por si, prova de barreira habitacional: a classificação não controla renda, tarifa, fila de conexão ou qualquer outro fator. A população usada como denominador é estimada, não censitária. A classificação exclui municípios pendentes de reextração de dado de MMGD residencial (Seção 6).

### 10. Descompasso Morfológico

#### 10.1 Definição

Ver Seção 4.

#### 10.2 Precariedade construtiva

Indicadores usados: percentual de domicílios em cortiço, percentual de domicílios com parede externa inadequada (Censo IBGE 2022) e percentual/número de população em favelas e comunidades urbanas (Cadastro Nacional FCU/IBGE). Os três componentes formam o índice de precariedade habitacional (normalização min–max nacional, escala 0–1), usado tanto no Descompasso Morfológico quanto como componente do IVSH.

#### 10.3 Alta verticalização

A variável disponível para esta hipótese é o percentual de domicílios do tipo apartamento (Censo IBGE 2022, Tabela SIDRA 9928). **Diferente do que a formulação inicial deste trabalho presumia, os materiais disponíveis não contêm um critério de corte formal (por exemplo, "mais de 50% dos domicílios"), nem uma contagem de municípios classificados sob esse critério, nem distribuição regional, nem análise de sensibilidade do corte.** A variável aparece nos materiais apenas como covariável de controle em investigações exploratórias de outliers regionais.

Mais relevante: o único teste quantitativo direto encontrado nos materiais (`percentual_apartamento` sobre adoção de MMGD residencial, controlando renda) produziu coeficiente parcial **positivo** (+0,115 a +0,156), o oposto do que a hipótese "mais apartamento, menos telhado próprio, menos adoção" preveria. A interpretação registrada nos materiais é que essa variável provavelmente funciona como proxy de porte e modernidade urbana (cidades maiores, mais informação, mais instaladoras presentes), não como medida limpa de barreira de telhado individual.

**Por isso, este anexo trata "alta verticalização" como uma hipótese conceitual plausível — telhados compartilhados de fato exigem decisão coletiva de instalação e regulação de autoconsumo em condomínio, o que é uma diferença de desenho de política real frente à precariedade construtiva —, mas não a apresenta como um padrão estatisticamente confirmado de barreira à adoção**, porque o teste disponível aponta na direção contrária. **[inconsistência a esclarecer] / [revisão estatística necessária]**.

#### 10.4 Indicadores utilizados

Precariedade construtiva: percentual de cortiço, percentual de parede inadequada, percentual/número de população em favela (FCU). Verticalização: percentual de domicílios em apartamento (hipótese não confirmada, ver 10.3).

#### 10.5 Critérios de classificação

Para precariedade construtiva: os materiais não especificam um limiar binário de classificação além do índice contínuo normalizado (0–1) usado como variável explicativa nos testes estatísticos (Seção 12) e como componente do IVSH — não há, nos materiais, uma classificação municipal binária "descompasso morfológico: sim/não" com um corte definido. Os casos territoriais citados (Seção 10.7) foram identificados como exemplos ilustrativos de município com irradiação acima da mediana nacional combinada a índice de precariedade elevado, não por um critério de corte formal e documentado.

#### 10.6 Resultados territoriais

Não há, nos materiais, uma contagem nacional de municípios em descompasso morfológico por precariedade construtiva (distinta da classificação de Vazio de Acesso). Os materiais oferecem apenas os casos ilustrativos da Seção 10.7. **[resultado não informado]** para uma contagem nacional consolidada.

#### 10.7 Casos ilustrativos

- **Uiramutã (RR):** irradiação solar 5,14 kWh/m²/dia (acima da mediana nacional), índice de precariedade habitacional 0,33 (aproximadamente o triplo da média nacional descritiva citada nos materiais), adoção solar residencial per capita igual a **zero**.
- **Jaboatão dos Guararapes, Cabo de Santo Agostinho e Olinda (PE):** irradiação acima da mediana nacional; índice de precariedade habitacional entre 0,15 e 0,22 (valor conjunto do grupo — **[informação a confirmar]** para valores individuais); classificados como Vazio de Acesso. Jaboatão dos Guararapes tem, adicionalmente, 644 mil habitantes e recebeu 1 contrato do Reforma Casa Brasil Solar no período auditado (Seção 14).

Esses quatro casos ilustram o Padrão 1 (precariedade construtiva) do Descompasso Morfológico. **Não há, nos materiais, casos ilustrativos documentados para a hipótese de verticalização** (Padrão 2) — ver 10.3.

Formulação recomendada para uso desses casos, evitando generalização indevida: *"Os indicadores sugerem maior probabilidade de limitações físicas, fundiárias, financeiras ou decisórias para a instalação individual de sistemas fotovoltaicos nesses territórios"* — não que cada edificação individual seja fisicamente incapaz de receber painéis.

#### 10.8 Limitações

A leitura opera em nível municipal — não há inspeção individual de moradias, nem confirmação de que a precariedade agregada do município se distribui uniformemente dentro dele. Os quatro municípios citados são exemplos ilustrativos, não uma amostra representativa nacional do fenômeno. A hipótese de verticalização carece de teste estatístico direto que a sustente na direção esperada (Seção 10.3).

### 11. Índice de Vulnerabilidade Sócio-Habitacional-Energética (IVSH)

#### 11.1 Definição e finalidade

Ver Seção 4. Métrica de priorização territorial que combina vulnerabilidade social geral, precariedade da moradia e insegurança da posse da terra, criada especificamente para captar vulnerabilidade que a classificação de Vazio de Acesso (que não usa nenhum indicador de moradia) e o Índice de Vulnerabilidade Social tradicional do Atlas (que, por desenho, exclui moradia) deixam de captar isoladamente.

#### 11.2 Dimensões

1. Vulnerabilidade social geral (Índice de Vulnerabilidade Social consolidado do Atlas: infraestrutura urbana, renda e trabalho, capital humano).
2. Precariedade física da moradia (cortiço, parede inadequada, população em favela/comunidade urbana).
3. Insegurança da posse da terra (inverso do índice de segurança da posse).

#### 11.3 Variáveis

Ver Seções 10.2 (precariedade) e 5.4 (posse) para as variáveis de cada dimensão. A dimensão de vulnerabilidade social geral não teve seus componentes individuais detalhados além do que consta na Seção 4 — infraestrutura urbana, renda e trabalho, capital humano — sem lista de subvariáveis específica nos materiais deste anexo.

#### 11.4 Normalização

O índice de precariedade habitacional é normalizado min–max em escala nacional (0–1). A escala do índice de segurança da posse usada na fórmula do IVSH é 0–100, confirmada por inspeção do código da migration 0028 (ver inconsistência #3, Bloco 1 — resolvida em 26/07/2026). O Índice de Vulnerabilidade Social consolidado já é, pelos materiais, produzido em escala 0–1.

#### 11.5 Ponderação

**Pesos iguais.** A fórmula documentada nos materiais é uma média aritmética simples dos três componentes — não há ponderação diferenciada entre vulnerabilidade social, precariedade habitacional e insegurança da posse. Não foi localizado teste de sensibilidade a pesos alternativos. **[teste de sensibilidade não realizado]**.

#### 11.6 Agregação

IVSH = média( IVS consolidado, índice de precariedade habitacional, 1 − índice de segurança da posse/100 ).

#### 11.7 Faixas ou categorias

Os materiais não definem faixas ou categorias qualitativas (ex.: "baixo/médio/alto") para o IVSH — apenas a escala contínua 0–1 e o uso como critério de ordenação/priorização (ranking). **[procedimento a confirmar]** caso o relatório principal deseje apresentar faixas.

#### 11.8 Resultados nacionais

Média nacional: **0,21** (0,2095 na fonte de maior precisão). Intervalo observado: **0 a 0,39** (0 a 0,387 na fonte de maior precisão). Calculado para 5.573 municípios — o universo real e completo da tabela `municipios` (ver Seção 6 e Bloco 1, item 4 — reconciliado em 26/07/2026).

#### 11.9 Distribuição territorial

Os materiais não fornecem uma distribuição regional completa do IVSH (por região ou UF) além dos cinco municípios de maior valor, citados individualmente na Seção 11.10. **[resultado não informado]** para uma distribuição territorial agregada.

#### 11.10 Municípios de destaque

Os cinco municípios de maior IVSH do país, segundo os materiais: **Alto Alegre (RR), Amajari (RR), Uiramutã (RR), Marajá do Sena (MA) e Cumaru do Norte (PA)**. Desses, três (Amajari, Uiramutã, Marajá do Sena) já eram classificados como Vazio de Acesso pela Matriz — coerência entre os dois instrumentos nesses casos. Os outros dois (Alto Alegre e Cumaru do Norte) estão classificados como "baixo potencial, baixa adoção" — ou seja, apresentam vulnerabilidade sócio-habitacional elevada mesmo sem irradiação acima da mediana nacional, o que só o IVSH capta, já que a Matriz de Vazios de Acesso depende de irradiação alta como pré-condição de classificação.

Isso explica, com base direta nos dados, por que um município pode ter IVSH elevado sem ser Vazio de Acesso: o IVSH não usa irradiação como variável — mede vulnerabilidade social e habitacional independentemente do potencial solar do território. A ausência de classificação como Vazio de Acesso não deve, portanto, ser lida como ausência de vulnerabilidade energética.

Valores individuais de IVSH, posição exata no ranking, e eventual ocorrência de empates para esses cinco municípios **não constam nos materiais** além da ordenação relativa entre eles. **[resultado não informado]**.

#### 11.11 Limitações

Índice ainda não validado externamente por pares (Seção 1). Pesos iguais entre dimensões sem teste de sensibilidade. Universo (5.573) e escala do componente de segurança da posse (0–100) — ambos reconciliados em 26/07/2026 (Bloco 1, itens 3 e 4).

### 12. Validação estatística

#### 12.1 Hipóteses

H1: a precariedade física da moradia está associada negativamente à adoção de MMGD residencial per capita, mesmo controlando renda e irradiação. H2 (exploratória, não hipotetizada a priori nos materiais): a segurança da posse da terra está associada positivamente à adoção de MMGD residencial per capita, controlando os mesmos fatores — hipótese que, como será visto, **não se confirmou na direção esperada**.

#### 12.2 Variáveis

Variável dependente: MMGD residencial per capita (potência residencial normalizada por 1.000 habitantes, ANEEL). Variáveis explicativas testadas: índice de precariedade habitacional; índice de segurança da posse. Variáveis de controle: renda média domiciliar (RAIS); irradiação solar média (INPE/LABREN).

#### 12.3 Método

Correlação parcial de postos (Spearman), calculada por resíduo de postos — método que primeiro remove estatisticamente (via regressão sobre os postos) o efeito das variáveis de controle de cada variável envolvida, e só então mede a correlação entre os resíduos. Controle de renda e irradiação aplicado **simultaneamente**, não em testes separados.

#### 12.4 Controles

Renda média domiciliar (RAIS) e irradiação solar média (INPE/LABREN), simultaneamente, para ambas as variáveis explicativas testadas.

#### 12.5 Resultados nacionais

| Variável X | ρ bruto | ρ parcial | p (parcial) | n |
|---|---:|---:|---:|---:|
| Índice de Precariedade Habitacional | −0,1312 | **−0,1524** | ≈ 2,7 × 10⁻³⁰ | 5.570 (citado nos materiais; ver nota de universo, Bloco 1, item 4) |
| Índice de Segurança da Posse | −0,3060 | **−0,2976** | ≈ 3,0 × 10⁻¹¹⁴ | 5.570 |

#### 12.6 Resultados regionais

O sinal do coeficiente parcial é mantido em **4 das 5 regiões brasileiras** para ambas as variáveis. **A região divergente não é identificada nominalmente nos materiais** para este teste específico (com controle conjunto de renda e irradiação) — os autores registram explicitamente que essa exceção "não foi diagnosticada nesta sessão". **[informação a confirmar]**.

#### 12.7 Intensidade das associações

Ambos os coeficientes parciais (−0,15 e −0,30) situam-se no terço inferior da escala de −1 a +1 — associações de intensidade **baixa a moderada-baixa**, não fortes. Em bases com milhares de observações e múltiplos controles simultâneos, os próprios materiais registram que valores nessa faixa já são considerados uma relação real, não ruído estatístico — mas isso não os torna efeitos de grande magnitude. O coeficiente de −0,2976 (segurança da posse) é proporcionalmente mais forte que o de −0,1524 (precariedade habitacional), mas ambos permanecem associações de baixa a moderada intensidade.

#### 12.8 Significância estatística

Os dois p-valores (≈2,7×10⁻³⁰ e ≈3,0×10⁻¹¹⁴) indicam que é extremamente improvável que os padrões observados tenham surgido por acaso, dado o tamanho da amostra (n≈5.570). **Isso não é o mesmo que dizer que o efeito é substantivamente grande** — em amostras muito grandes, mesmo associações de baixa magnitude produzem p-valores muito pequenos. O p-valor não deve ser lido, neste anexo, como medida de intensidade ou de importância prática do resultado — essa leitura cabe ao coeficiente (Seção 12.7).

#### 12.9 Limitações e variáveis omitidas

O modelo controla apenas renda e irradiação — não elimina o efeito de variáveis omitidas não incluídas no controle (por exemplo, fila de conexão da distribuidora, tarifa local, presença de instaladoras, cultura de crédito regional, todos mencionados em outras partes dos materiais do projeto como fatores relevantes em contextos específicos). A correlação parcial não estabelece causalidade e não demonstra diretamente o mecanismo físico da barreira (por exemplo, não confirma que é especificamente a estrutura do telhado que impede a instalação). Não há, nos materiais, tratamento formal de dependência ou autocorrelação espacial entre municípios vizinhos, nem de colinearidade entre as próprias variáveis de controle.

#### 12.10 Alcance das conclusões

Os resultados são **compatíveis com a hipótese de que a condição habitacional constitui uma dimensão relevante do acesso** à energia solar residencial, mesmo depois de descontar renda e irradiação — para a precariedade habitacional, na direção que a hipótese original previa. Não comprovam causalidade, não isolam o mecanismo específico da barreira, e um dos dois resultados (segurança da posse) contraria a direção esperada, exigindo cautela interpretativa adicional (Seção 12.11 abaixo).

**Achado inesperado, preservado sem suavização, conforme os próprios materiais também registram:** controlando renda e irradiação, municípios com **mais** segurança da posse (mais domicílios próprios) apresentam, em média, **menos** MMGD residencial per capita — o oposto do que a hipótese inicial do Instituto Pólis previa (que posse seguraria facilitaria o investimento). Os materiais oferecem, como hipótese interpretativa explicitamente não testada, que esse resultado possa refletir composição urbana — aluguel concentrado em áreas mais verticalizadas e centrais, onde a instalação solar individual já é mais difícil por outros motivos (ligando-se à discussão da Seção 10.3). Essa é uma hipótese, não um resultado confirmado, e é apresentada como tal.

Tabela de rastreabilidade (síntese desta seção):

| Relação analisada | Coeficiente | p-valor | Direção | Intensidade | Controles | Interpretação | Limitação |
|---|---:|---:|---|---|---|---|---|
| Precariedade habitacional × MMGD residencial per capita | ρ parcial = −0,1524 | ≈2,7×10⁻³⁰ | Negativa | Baixa a moderada-baixa | Renda (RAIS), irradiação (INPE/LABREN) | Compatível com a hipótese de barreira habitacional independente de renda e sol | Não estabelece causalidade; região divergente não identificada; variáveis omitidas não controladas |
| Segurança da posse × MMGD residencial per capita | ρ parcial = −0,2976 | ≈3,0×10⁻¹¹⁴ | Negativa (oposta à hipótese original) | Baixa a moderada | Renda (RAIS), irradiação (INPE/LABREN) | Achado inesperado; hipótese de composição urbana não testada | Escala do índice reconciliada em 26/07/2026 (Bloco 1, item 3); mecanismo do sinal invertido ainda não identificado |

### 13. Leitura integrada dos três instrumentos

**Convergências:** três dos cinco municípios de maior IVSH (Amajari, Uiramutã, Marajá do Sena) também são Vazio de Acesso — nesses casos, os dois instrumentos apontam para o mesmo território prioritário por caminhos metodológicos diferentes (um usa irradiação, o outro não). Uiramutã aparece, adicionalmente, como caso ilustrativo do Descompasso Morfológico — os três instrumentos convergem para esse único município.

**Divergências:** dois dos cinco municípios de maior IVSH (Alto Alegre, Cumaru do Norte) **não** são Vazio de Acesso, porque têm irradiação abaixo da mediana nacional — vulnerabilidade sócio-habitacional real que a Matriz de Vazios de Acesso, por depender de irradiação alta, não capta. Simetricamente, a auditoria do Reforma Casa Brasil Solar (Seção 14) mostra que a correlação entre precariedade habitacional e presença de contrato do programa **não se traduz** em maior presença desses contratos no quadrante Vazio de Acesso — as duas dimensões (moradia precária; potencial solar desperdiçado) não coincidem sistematicamente no mesmo conjunto de municípios.

**Vulnerabilidade sem Vazio de Acesso:** ocorre quando a irradiação municipal está abaixo da mediana nacional — nesses casos, o IVSH é o único dos três instrumentos capaz de capturar a vulnerabilidade combinada.

**Vazio de Acesso sem IVSH elevado:** pelos materiais disponíveis, não é possível quantificar quantos dos 1.451 municípios Vazio de Acesso têm IVSH baixo — apenas o caso inverso (os cinco de maior IVSH) foi cruzado explicitamente com a classificação de quadrante. **[resultado não informado]** para essa contagem específica.

**Efeitos possíveis da morfologia:** a hipótese de verticalização (Seção 10.3), se um dia confirmada por teste estatístico direto e não contraditório como o disponível hoje, apontaria para uma tipologia territorial distinta — municípios de alta adoção "esperada" por renda e infraestrutura, mas com barreira de decisão coletiva em vez de precariedade construtiva. Essa tipologia **não pode ser afirmada com os dados atuais**.

**Implicação da leitura conjunta:** nenhum dos três instrumentos, isoladamente, esgota o diagnóstico de vulnerabilidade energético-habitacional. A Matriz de Vazios de Acesso prioriza por potencial solar desperdiçado; o Descompasso Morfológico qualifica o tipo de barreira física possível; o IVSH prioriza por vulnerabilidade combinada, independentemente do potencial solar. Um uso responsável dos três exige apresentá-los como lentes complementares, não como uma hierarquia única de prioridade — recomendação já registrada nos próprios materiais.

### 14. Auditoria territorial do Reforma Casa Brasil Solar

#### 14.1 Objetivo

Verificar se a distribuição territorial dos contratos e recursos do Reforma Casa Brasil Solar — identificado nos materiais como o principal programa de crédito habitacional com componente solar localizado no país — coincide com os municípios classificados como Vazio de Acesso, com maior precariedade habitacional, e com maior IVSH.

#### 14.2 Base de dados

Extrato do Sistema de Informação ao Cidadão (SIC) da Caixa Econômica Federal, cobrindo novembro de 2025 a abril de 2026 (6 meses). Fonte não pública e não automatizável — qualquer atualização futura exige novo pedido formal. Agregado único por município (sem chave de indivíduo, contrato ou endereço). Totais no período: **R$ 61.377.571,09 liberados, 3.253 contratos, 1.093 municípios com pelo menos um contrato**. Não há, nos materiais, confirmação sobre se os valores são nominais ou corrigidos, data exata de extração, ou tratamento de contratos cancelados/duplicados. **[informação a confirmar]** nesses quatro pontos.

#### 14.3 Universo

A auditoria opera sobre os mesmos **5.569 municípios classificáveis** da Matriz de Vazios de Acesso (Seção 6): 1.093 com contrato e 4.476 sem contrato (soma exata = 5.569). Uma segunda tabela do mesmo material-fonte usa n=4.480 para "sem contrato" numa comparação diferente (precariedade habitacional, base completa) — diferença de 4 municípios não explicada (Bloco 1, item 2). **[inconsistência a esclarecer]**.

#### 14.4 Distribuição dos contratos

| Quadrante da Matriz de Vazios de Acesso | Municípios com contrato (n=1.093) | Municípios sem contrato (n=4.476) |
|---|---:|---:|
| Acesso pleno | 34,5% (377) | 21,4% (957) |
| Adoção acima do potencial | 29,6% (324) | 25,2% (1.127) |
| Baixo potencial, baixa adoção | 15,1% (165) | 26,1% (1.168) |
| Vazio de Acesso | 20,8% (227) | 27,3% (1.224) |

Os percentuais foram recalculados nesta auditoria diretamente sobre os totais absolutos (377/1.093 etc.) e conferem com os valores reportados nos materiais. **Denominador: proporção de municípios em cada quadrante, não proporção de contratos nem de recursos** — distinção que deve ser preservada em qualquer citação deste resultado.

Municípios com contrato têm proporcionalmente mais presença em "Acesso pleno" (34,5% vs. 21,4%) e menos em "Vazio de Acesso" (20,8% vs. 27,3%) do que municípios sem contrato. O efeito líquido observado, segundo os materiais, é de **reforço**, não de correção, do padrão espacial de acesso solar já existente — leitura descritiva, não teste de significância formal desta diferença de proporções.

#### 14.5 Distribuição dos recursos

| Quadrante | Valor médio liberado por 1.000 hab. (só entre os 1.093 municípios com contrato) | Total liberado |
|---|---:|---:|
| Acesso pleno | R$ 2.033,24 | R$ 23.113.392,22 |
| Adoção acima do potencial | R$ 2.441,27 | R$ 23.204.340,11 |
| Baixo potencial, baixa adoção | R$ 1.080,59 | R$ 6.469.348,51 |
| Vazio de Acesso | R$ 1.410,93 | R$ 8.590.490,25 |

A soma dos quatro totais (R$ 61.377.571,09) confere exatamente com o total geral liberado no período — quadro internamente consistente. O valor per capita em Vazio de Acesso é **30,6% menor** que em Acesso pleno (recálculo confere com os materiais, que citam "30%"). Já a comparação com "Adoção acima do potencial" — os materiais citam "31% menor", mas o recálculo direto a partir dos mesmos dois valores da tabela (R$ 1.410,93 e R$ 2.441,27) resulta em **42,2% menor**, não 31%. **[revisão estatística necessária]** — este anexo preserva a divergência, sem escolher silenciosamente qual dos dois números está correto.

Quando o programa chega a um Vazio de Acesso, portanto, chega proporcionalmente com **menos recurso por habitante** do que chega a territórios já bem servidos — tanto pela leitura de 30,6% quanto pela de 42,2%, a direção do achado (menos intensidade nos vazios) se sustenta; apenas a magnitude exata da diferença frente a "Adoção acima do potencial" precisa de confirmação.

Casos extremos citados nos materiais, que **não devem sustentar sozinhos** a conclusão geral (a tabela nacional acima já a sustenta de forma mais robusta): Jaboatão dos Guararapes (PE), Vazio de Acesso, 1 contrato, R$ 20,96/1.000 hab.; São João do Piauí (PI), Acesso pleno, 10 contratos, R$ 10.009,66/1.000 hab. — recálculo confirma a proporção de "quase 480 vezes" citada nos materiais (10.009,66/20,96 ≈ 477,5). Os materiais não informam se há valores extremos adicionais nas duas pontas da distribuição, nem apresentam mediana (apenas médias) — o que impede avaliar se esses dois casos são representativos ou atípicos dentro de seus respectivos quadrantes. **[teste de sensibilidade não realizado]**.

#### 14.6 Comparação entre quadrantes

Ver 14.4 e 14.5. A comparação mostra que frequência de contrato, proporção de municípios e intensidade financeira per capita seguem, todos os três, a mesma direção (menos presença, menos recurso em Vazios de Acesso) — mas são três medidas distintas e não devem ser somadas ou usadas de forma intercambiável.

#### 14.7 Relação com precariedade e IVSH

| Recorte | Precariedade habitacional média — com contrato | Precariedade habitacional média — sem contrato |
|---|---:|---:|
| Base completa | 0,0259 (n=1.093) | 0,0153 (n=4.480, conferir com n=4.476 usado em 14.3 — Bloco 1, item 2) |
| Somente dentro de Vazios de Acesso | 0,0281 (n=227) | 0,0186 (n=1.224) |

Municípios com contrato têm precariedade habitacional média **~70% maior** (base completa: (0,0259−0,0153)/0,0153 ≈ 69,3%) e **~51% maior** dentro dos Vazios de Acesso ((0,0281−0,0186)/0,0186 ≈ 51,1%) — ambos os recálculos conferem com os materiais. Essa comparação é uma diferença de médias **descritiva**; os materiais não reportam desvio-padrão, mediana ou teste de significância para essa diferença. **[revisão estatística necessária]**.

O ponto metodologicamente mais importante desta seção, preservado dos materiais: essa correlação positiva com precariedade habitacional **não se traduz** em maior presença proporcional do programa no quadrante Vazio de Acesso — pelo contrário, a Seção 14.4 mostra presença proporcionalmente **menor** nesse quadrante. Isto é, o programa parece responder a uma lógica territorial própria — plausivelmente ligada a onde a Caixa já opera reforma habitacional — que **correlaciona com moradia precária em geral, mas não coincide sistematicamente com o critério de potencial solar desperdiçado** que define Vazio de Acesso. Este anexo evita o termo "ortogonalidade" (usado nos materiais-fonte sem teste formal de independência estatística) e descreve o achado em termos das duas comparações descritivas acima.

O IVSH não foi cruzado, nos materiais disponíveis, com a base de contratos do Reforma Casa Brasil Solar de forma explícita e numérica — apenas indiretamente, pelos casos de Aldeias Altas, Buriti e Mirador (14.8), que têm IVSH presumivelmente elevado (são Vazio de Acesso com precariedade alta) mas não aparecem na lista dos cinco municípios de maior IVSH nacional. **[resultado não informado]** para um cruzamento numérico direto IVSH × cobertura do programa.

#### 14.8 Municípios atendidos e não atendidos

**Aldeias Altas, Buriti e Mirador (MA)** — três municípios classificados como Vazio de Acesso, com índice de precariedade habitacional entre 0,13 e 0,15 (valor conjunto, não individual — **[informação a confirmar]**), **sem nenhum contrato registrado do Reforma Casa Brasil Solar no período analisado** (nov/2025–abr/2026). Os materiais não indicam se essa ausência decorre de inelegibilidade, ausência de demanda, ou outro motivo — apenas registram a ausência de contrato no recorte temporal disponível. **[objetivos e critérios oficiais do programa a confirmar]**, ver 14.9.

#### 14.9 Limitações da auditoria

O cruzamento é municipal-agregado — não há chave de indivíduo/domicílio ligando contratos específicos a características habitacionais específicas dentro do município. **Público-alvo e um critério de elegibilidade central foram localizados no relatório principal** (Parte II, Tabela 1): o Reforma Casa Brasil — programa do qual "Reforma Casa Brasil Solar" é a modalidade com componente fotovoltaico — é voltado a famílias com renda familiar bruta mensal de até R$ 9.600, podendo ser solicitado por moradores de área urbana mesmo sem escritura do imóvel ou com financiamento habitacional em andamento. Isso confirma que o programa não exige, ao menos formalmente, regularidade fundiária plena — o que é relevante para interpretar os casos de Aldeias Altas, Buriti e Mirador (14.8): sua ausência de contrato não decorre, pelo critério de posse, de inelegibilidade formal, embora outros critérios (renda familiar acima de R$ 9.600, ausência de demanda, capacidade operacional do agente financeiro na região) permaneçam **[a confirmar]**. Condições de crédito (taxa, prazo), metas territoriais, existência de focalização ativa e período de maturação esperado do programa continuam sem confirmação em qualquer material disponível. O período coberto pela auditoria (6 meses) é curto para avaliar maturação de um programa de crédito habitacional. Os valores financeiros não têm confirmação de correção monetária.

#### 14.10 Implicações para aperfeiçoamento da política

Formulação recomendada, dentro do alcance real da evidência: os resultados indicam **baixa convergência territorial** entre a distribuição observada do Reforma Casa Brasil Solar e a Matriz de Vazios de Acesso do Atlas; a distribuição observada não parece priorizar sistematicamente os territórios de maior potencial solar desperdiçado, ainda que correlacione, em média, com maior precariedade habitacional; os dados sugerem espaço para avaliar critérios territoriais de priorização que combinem os três instrumentos deste anexo — mas essa avaliação depende de informação sobre os objetivos e critérios oficiais do programa que não está disponível nos materiais consultados. Não se sustenta, com os dados disponíveis, uma afirmação de "ineficiência comprovada" ou "falha sistemática" do programa.

### 15. Síntese dos principais resultados

A Matriz de Vazios de Acesso revelou uma concentração territorial acentuada e regionalmente desigual (77,4% dos Vazios de Acesso no Nordeste, 0% no Sul), com ressalva metodológica explícita de que parte dessa concentração reflete o gargalo de renda já documentado nacionalmente, não apenas potencial solar desperdiçado por barreira habitacional.

O Descompasso Morfológico acrescentou uma qualificação ao tipo de barreira possível em territórios de alta precariedade construtiva (casos como Uiramutã, com adoção zero apesar de irradiação acima da mediana) — mas a hipótese complementar de verticalização não encontrou sustentação no único teste estatístico direto disponível, que apontou sinal contrário ao esperado. Este é um resultado que contraria a formulação inicial do instrumento e é preservado como tal, não suavizado.

O IVSH captou vulnerabilidade sócio-habitacional em municípios que a Matriz de Vazios de Acesso, por depender de irradiação alta, não conseguiria identificar (Alto Alegre e Cumaru do Norte) — evidência direta de que os dois instrumentos são complementares, não redundantes.

O alcance da validação estatística é de associações reais, mas de intensidade baixa a moderada, estatisticamente muito significativas dado o tamanho da amostra — a precariedade habitacional confirma a hipótese central do Instituto Pólis na direção esperada; a segurança da posse produziu um resultado inesperado e não suavizado, na direção oposta à hipotetizada.

A auditoria do Reforma Casa Brasil Solar revelou que o programa reforça, não corrige, o padrão espacial de acesso solar já existente, tanto em frequência de contratos quanto em intensidade de recurso per capita — mas essa leitura carece de informação sobre os objetivos e critérios oficiais do programa para ser convertida em avaliação de eficácia.

Resultados inesperados preservados neste anexo: o sinal invertido da variável de segurança da posse (Seção 12.10); o sinal positivo, e não negativo, de `percentual_apartamento` sobre a adoção solar (Seção 10.3); e a divergência de 42,2% (não 31%) na comparação de intensidade financeira entre Vazio de Acesso e Adoção acima do potencial (Seção 14.5).

Hipóteses reforçadas: precariedade habitacional como barreira à adoção solar independente de renda e irradiação. Hipóteses que permanecem abertas: mecanismo causal exato por trás da associação (o modelo não distingue barreira física, decisória ou financeira); explicação para o sinal invertido de segurança da posse; existência real de um padrão de "descompasso por verticalização" com direção de efeito diferente da hipótese original.

### 16. Implicações para políticas públicas

**Implicações derivadas diretamente dos resultados apresentados neste anexo:**
- A focalização territorial de programas de crédito habitacional com componente solar deveria, no mínimo, ser cotejada com o IVSH e com a classificação de Vazio de Acesso antes de decisões de expansão geográfica — a auditoria do Reforma Casa Brasil Solar (Seção 14) mostra que essa checagem hoje aponta baixa convergência.
- Territórios com alta precariedade construtiva e irradiação elevada (padrão ilustrado por Uiramutã) são candidatos, pela lógica do instrumento, a modelos de geração compartilhada ou comunitária em vez de subsídio à instalação individual — porque o próprio índice de precariedade sugere limitação física ao telhado individual. Esta é uma implicação de desenho de política coerente com a definição conceitual do instrumento (Seção 4), não uma recomendação testada por avaliação de impacto.
- Municípios de alto IVSH fora do quadrante Vazio de Acesso (como Alto Alegre e Cumaru do Norte) exigem um critério de priorização que não dependa exclusivamente de irradiação — o IVSH, e não a Matriz isoladamente, é o instrumento adequado para essa priorização.

**Propostas que dependem de avaliação adicional, não sustentadas diretamente pelos dados deste anexo:**
- Redesenho dos critérios de elegibilidade do Reforma Casa Brasil Solar — depende de conhecer os objetivos e critérios oficiais do programa, hoje não disponíveis (Seção 14.9).
- Regulação de autoconsumo em condomínio como resposta à "alta verticalização" — depende de confirmação estatística que hoje não existe (Seção 10.3); a evidência disponível aponta na direção contrária.
- Definição de faixas de subsídio diferenciado por IVSH — depende de definição de faixas/categorias do índice, ainda não estabelecidas nos materiais (Seção 11.7).

**Hipóteses para estudos futuros:**
- Investigar o mecanismo por trás do sinal invertido de segurança da posse (composição urbana, verticalização, tipologia de aluguel).
- Testar formalmente um critério de classificação de "descompasso por verticalização" com corte definido e análise de sensibilidade, hoje inexistente.
- Cruzar IVSH diretamente com a base de contratos do Reforma Casa Brasil Solar, hoje feito apenas indiretamente por meio de casos individuais.
- Obter os objetivos, público-alvo e critérios de elegibilidade oficiais do programa para transformar a auditoria descritiva (Seção 14) em avaliação de aderência normativa.

Os demais temas do enunciado original desta tarefa — busca ativa, geração comunitária em escala, fundos climáticos, linhas de crédito específicas, monitoramento territorial contínuo, integração formal entre políticas de habitação e energia — não têm, nos materiais disponíveis, dado ou análise que sustente uma recomendação específica além do que já está listado acima. Recomendações genéricas sobre esses temas não são apresentadas, por não decorrerem diretamente da evidência deste anexo.

### 17. Robustez e sensibilidade

Testes efetivamente realizados e documentados nos materiais: (i) verificação de robustez regional do sinal dos dois coeficientes parciais da Seção 12 (mantido em 4 de 5 regiões, região divergente não identificada); (ii) teste exploratório de hipóteses alternativas para dois casos regionais divergentes num teste anterior e metodologicamente distinto (Sul/segurança da posse, Centro-Oeste/irradiação), incluindo tipologia habitacional (`percentual_apartamento`) como possível confundidor — não confirmado como explicação, investigação formalmente encerrada por decisão do usuário sem resultado conclusivo; (iii) separação de MMGD residencial da MMGD total (agronegócio/irrigação), que resolveu 3 dos 4 outliers regionais originalmente observados num teste preliminar.

Testes **não realizados**, segundo os materiais disponíveis, e portanto não avaliados neste anexo: sensibilidade da classificação de Vazio de Acesso a medianas alternativas (por exemplo, terços ou quartis em vez de mediana); sensibilidade de um eventual corte de verticalização (que, como já registrado, nem sequer existe formalmente); sensibilidade dos pesos do IVSH a ponderações alternativas; teste formal de dependência ou autocorrelação espacial entre municípios vizinhos; teste de colinearidade entre as variáveis de controle (renda e irradiação); comparação sistemática entre média e mediana para os indicadores financeiros do Reforma Casa Brasil Solar; e estabilidade regional nominal (quais das 5 regiões, especificamente, divergem no teste de três variáveis de controle). **[teste de sensibilidade não realizado]** para todos os itens deste parágrafo.

### 18. Limitações

Limitações das bases: irradiação é uma climatologia de 1999–2015, não uma medição corrente; MMGD residencial é um snapshot acumulado sem série temporal; população municipal é estimada, não censitária; o índice de precariedade habitacional mede material construtivo, não o Déficit Habitacional oficial da Fundação João Pinheiro; o Reforma Casa Brasil Solar é uma fonte estática, obtida por pedido formal de acesso à informação, sem atualização automática.

Diferenças temporais entre fontes: irradiação (1999–2015), moradia (Censo 2022), MMGD (snapshot mais recente disponível), Reforma Casa Brasil Solar (nov/2025–abr/2026) — os três instrumentos combinam dados de períodos distintos sem uma data de referência única.

Escala municipal e risco de falácia ecológica: nenhuma conclusão deste anexo pode ser transposta para o nível do domicílio individual ou do bairro — a única tentativa de leitura sub-municipal nos materiais do projeto (piloto de São Paulo) é sintética, não uma medição real, e está fora do escopo deste anexo.

Ausência de inspeção individual de moradias: todos os índices de precariedade e verticalização são agregados censitários, não vistorias.

Limites da correlação e impossibilidade de causalidade: os testes da Seção 12 estabelecem associação estatística após dois controles; não estabelecem mecanismo causal, não eliminam variáveis omitidas, e um dos dois resultados contraria a hipótese original.

Escolhas de corte: a mediana nacional como limiar da Matriz de Vazios de Acesso, e os pesos iguais do IVSH, são escolhas metodológicas razoáveis mas não as únicas possíveis, e não foram testadas contra alternativas nos materiais disponíveis.

Restrições da auditoria de política pública: a auditoria do Reforma Casa Brasil Solar carece de informação sobre objetivos e critérios oficiais do programa, é municipal-agregada (sem chave individual), e cobre um período de execução curto (6 meses) — insuficiente para avaliar maturação ou tendência do programa.

Qualidade cadastral e subnotificação: os materiais não relatam avaliação de qualidade cadastral das fontes primárias além do que já foi citado (por exemplo, ausência de chave individual na base do Reforma Casa Brasil Solar).

### 19. Atualização e replicação

Bases que precisam de atualização periódica, segundo os materiais: MMGD residencial (ANEEL, snapshot acumulado — não há série temporal real hoje; qualquer leitura de "evolução" exigiria reextrações periódicas registradas com data própria); Reforma Casa Brasil Solar (fonte estática, exige novo pedido formal ao SIC/Caixa a cada atualização, sem endpoint público conhecido). Irradiação solar (climatologia INPE/LABREN) e dados de moradia do Censo têm ciclo de atualização próprio, definido pelas respectivas instituições produtoras, não pelo Atlas.

Periodicidade recomendada: não especificada nos materiais para os três instrumentos deste anexo especificamente. **[procedimento a confirmar]**.

Etapas automatizáveis, segundo os materiais: extração e classificação da Matriz de Vazios de Acesso e cálculo do IVSH já são processos com script definido, reexecutáveis sobre dados atualizados. Etapas que exigem revisão humana: qualquer nova extração do Reforma Casa Brasil Solar (fonte manual, PDF); reconciliação das inconsistências de universo e de escala identificadas no Bloco 1; diagnóstico da região divergente nos testes de correlação parcial (Seção 12.6); definição de um critério formal de verticalização, caso essa hipótese seja retomada.

Documentação necessária para replicação: os materiais indicam que a metodologia de classificação de quadrante, o cálculo do IVSH e o script de correlação parcial existem como código versionado no projeto — mas este anexo não teve acesso ao código-fonte, apenas às descrições textuais nos dois documentos-fonte, e não pode confirmar independentemente que a implementação corresponde exatamente ao texto. **[revisão técnica necessária]** caso se deseje auditar o código diretamente antes de publicar este anexo.

### 20. Referências

Fontes de dados citadas nos materiais consultados para este anexo (não uma revisão bibliográfica — nenhuma referência acadêmica ou institucional foi localizada nos materiais além das fontes de dado primário):

- ANEEL — microdados de Geração Distribuída (MMGD), classe residencial.
- INPE/LABREN-CCST — Atlas Brasileiro de Energia Solar, irradiação global horizontal, climatologia 1999–2015.
- IBGE — Censo Demográfico 2022, Tabela SIDRA 9928 (tipo de domicílio) e tabelas de adequação da moradia (paredes) e condição de ocupação.
- IBGE/FCU — Cadastro Nacional de Favelas e Comunidades Urbanas.
- RAIS — renda média domiciliar (período não especificado nos materiais).
- Caixa Econômica Federal — extrato do Sistema de Informação ao Cidadão (SIC), programa Reforma Casa Brasil Solar, nov/2025–abr/2026.

**[fonte a confirmar]** para qualquer referência acadêmica, institucional ou metodológica externa (por exemplo, eventual diálogo metodológico com o Observatório Brasileiro de Erradicação da Pobreza Energética, citado em um dos materiais-fonte como possível parceiro de validação futura, mas não como fonte já incorporada à metodologia destes três instrumentos) — nenhuma foi encontrada documentada o suficiente para citação formal neste anexo.

---

## BLOCO 3 — Quadros-síntese

### QUADRO 1 — Síntese dos instrumentos

| Instrumento | O que analisa | Unidade | Variáveis principais | Critério | Resultado central | Interpretação | Limitação |
|---|---|---|---|---|---|---|---|
| Matriz de Vazios de Acesso | Descolamento entre potencial solar e adoção residencial | Município (n=5.569 classificáveis) | Irradiação (INPE/LABREN); MMGD residencial per capita (ANEEL) | Mediana nacional em cada eixo | 1.451 municípios (26,1%) em Vazio de Acesso, 77,4% deles no Nordeste | Classificação relativa de prioridade territorial, não diagnóstico causal | Corte bivariado, não controla renda; população estimada |
| Descompasso Morfológico | Barreira física/tipológica da moradia à instalação individual | Município (sem contagem nacional consolidada) | Índice de precariedade habitacional; percentual de apartamento (hipótese) | Sem corte formal documentado | Casos ilustrativos (Uiramutã, Jaboatão dos Guararapes, Cabo de Santo Agostinho, Olinda) para precariedade construtiva | Sugere maior probabilidade de limitação física, não prova individual | Hipótese de verticalização contrariada pelo único teste direto disponível |
| IVSH | Vulnerabilidade combinada: social + habitacional + posse | Município (n=5.573, universo completo — reconciliado 26/07/2026) | IVS consolidado; precariedade habitacional; (1 − segurança da posse/100) | Média simples dos três componentes | Média nacional 0,21; máximo 0,39; top 5 nomeados | Capta vulnerabilidade mesmo fora do quadrante Vazio de Acesso | Sem validação externa por pares; pesos iguais sem teste de sensibilidade |

### QUADRO 2 — Síntese dos resultados

| Instrumento | Principais resultados | Evidências estatísticas | Casos territoriais | Implicação para políticas públicas |
|---|---|---|---|---|
| Matriz de Vazios de Acesso | Concentração de 77,4% dos Vazios de Acesso no Nordeste; 0% no Sul | Corte bivariado por mediana, sem teste de significância formal da diferença regional | — | Priorização territorial deve considerar ressalva de renda |
| Descompasso Morfológico | Precariedade construtiva associada a adoção zero em caso extremo (Uiramutã); verticalização sem confirmação estatística | ρ parcial não aplicável (variável testada só como controle exploratório, sinal contrário à hipótese) | Uiramutã, Jaboatão dos Guararapes, Cabo de Santo Agostinho, Olinda | Geração compartilhada/comunitária como resposta a precariedade construtiva confirmada; verticalização não sustenta recomendação ainda |
| IVSH | Identifica vulnerabilidade em municípios fora do quadrante Vazio de Acesso | Sem teste estatístico formal (índice composto descritivo) | Alto Alegre, Amajari, Uiramutã, Marajá do Sena, Cumaru do Norte | Critério de priorização complementar à Matriz |
| Validação estatística (moradia × MMGD) | Precariedade habitacional confirma hipótese; segurança da posse inverte sinal esperado | ρ parcial −0,1524 (p≈2,7×10⁻³⁰); ρ parcial −0,2976 (p≈3,0×10⁻¹¹⁴) | — | Reforça moradia como pré-condição de política energética, com cautela sobre posse |
| Auditoria Reforma Casa Brasil Solar | Programa reforça, não corrige, padrão de acesso desigual | Diferenças percentuais descritivas (30,6%; 42,2% — corrigido nos documentos-fonte internos em 26/07/2026, correção ainda pendente no rascunho do relatório principal, ver Quadro 5) | Jaboatão dos Guararapes, São João do Piauí, Aldeias Altas, Buriti, Mirador | Espaço para revisão de critérios territoriais, condicionado a conhecer objetivos oficiais do programa |

### QUADRO 3 — Auditoria do programa

| Dimensão | Resultado observado | Indicador utilizado | Interpretação | Limitação |
|---|---|---|---|---|
| Frequência por quadrante | Vazio de Acesso: 20,8% dos municípios com contrato vs. 27,3% sem contrato | Classificação de quadrante × presença de contrato | Reforço, não correção, do padrão espacial existente | Comparação descritiva, sem teste de significância |
| Intensidade financeira | R$ 1.410,93/1.000 hab. em Vazio de Acesso vs. R$ 2.033,24 (Acesso pleno) e R$ 2.441,27 (Adoção acima do potencial) | Valor liberado per capita por quadrante | Vazios de Acesso recebem recurso proporcionalmente menor | Diferença percentual frente a "Adoção acima do potencial": corrigida para 42,2% em `RELATORIO_AUDITORIA_MORADIA_SOLAR.md` (26/07/2026); rascunho do relatório principal ainda cita o valor aproximado antigo (ver Quadro 5) |
| Precariedade habitacional | Municípios com contrato têm precariedade ~70% (base completa) a ~51% (dentro dos vazios) maior | Índice de precariedade habitacional, médias por grupo | Correlaciona com precariedade, mas não com o eixo de potencial solar desperdiçado | Sem teste de significância; denominador da base completa diverge entre tabelas (4.476 vs. 4.480) |
| Municípios de alta vulnerabilidade sem cobertura | Aldeias Altas, Buriti, Mirador (MA): Vazio de Acesso, alta precariedade, zero contratos | Cruzamento nominal de casos | Vulnerabilidade não é condição suficiente para cobertura do programa | Não se sabe se por inelegibilidade ou ausência de demanda — objetivos do programa não disponíveis |

### QUADRO 4 — Rastreabilidade das afirmações

| Afirmação central | Resultado que a sustenta | Fonte | Procedimento | Alcance da evidência | Limitação | Situação da verificação |
|---|---|---|---|---|---|---|
| 1.451 municípios são Vazio de Acesso (26,1%) | Classificação por mediana nacional dupla | ANEEL + INPE/LABREN | Corte bivariado por mediana | Nacional, corte simples | Não controla renda | Verificado (soma dos quadrantes confere) |
| Vazio de Acesso concentrado no Nordeste (77,4%) | Distribuição regional da classificação | ANEEL + INPE/LABREN | Contagem por região | Descritivo | Sem teste de significância da diferença regional | Verificado (números internamente consistentes) |
| Precariedade habitacional associada a menos MMGD, controlando renda e irradiação | ρ parcial = −0,1524, p≈2,7×10⁻³⁰ | Censo 2022 + FCU + ANEEL + RAIS + INPE | Correlação parcial de postos (Spearman) | Nacional, n≈5.570 | Não estabelece causalidade; região divergente não identificada | Parcialmente verificado |
| Segurança da posse associada a menos MMGD (sinal invertido) | ρ parcial = −0,2976, p≈3,0×10⁻¹¹⁴ | Censo 2022 + ANEEL + RAIS + INPE | Correlação parcial de postos (Spearman) | Nacional, n≈5.570 | Escala do índice reconciliada em 26/07/2026 (0–100, ver Bloco 1 item 3); mecanismo do sinal invertido ainda não identificado | Parcialmente verificado |
| Alta verticalização é um segundo padrão de descompasso morfológico | Nenhum teste direto de confirmação; teste exploratório correlato aponta sinal contrário | ARQUITETURA.md (achado colateral) | Correlação parcial exploratória, controle por renda | Nacional, mas não desenhado para testar esta hipótese especificamente | Contradiz a narrativa dos dois documentos-fonte principais | Inconsistência identificada |
| IVSH: média nacional 0,21, máximo 0,39, calculado para 5.573 municípios | Estatísticas descritivas do índice | IVS consolidado + precariedade habitacional + segurança da posse | Média simples dos três componentes | Nacional | 5.573 é o universo real da tabela `municipios` (confirmado com o shapefile-fonte, sem duplicatas); "~5.570" nos demais materiais é aproximação desatualizada | Verificado e reconciliado (26/07/2026) |
| Vazio de Acesso recebe 42,2% menos recurso per capita que "Adoção acima do potencial" | Tabela de valores per capita por quadrante | Extrato SIC/Caixa | Cálculo de percentual de diferença | Descritivo | Valor original ("31% menor") tinha erro de cálculo — corrigido nos documentos-fonte internos em 26/07/2026 | Verificado e corrigido (rascunho do relatório principal ainda pendente, ver Quadro 5) |
| Programa reforça, não corrige, o padrão espacial de acesso solar | Comparação de frequência e intensidade por quadrante | Extrato SIC/Caixa + classificação de Vazio de Acesso | Comparação descritiva de percentuais e médias | Descritivo, sem teste formal | Direção do achado (menos presença/intensidade em vazios) se sustenta apesar do erro de magnitude acima | Parcialmente verificado |

### QUADRO 5 — Pendências

| Pendência | Por que importa | Informação necessária | Responsável sugerido |
|---|---|---|---|
| ~~Reconciliar universo do IVSH (5.573) com o universo nacional (~5.570)~~ **[RESOLVIDO 26/07/2026]** — 5.573 é o universo real (confirmado com o shapefile-fonte); "~5.570" é a aproximação desatualizada | Afeta a confiabilidade de qualquer estatística nacional do IVSH citada no relatório principal | Auditoria do código/consulta que gera `vw_ivsh_consolidado` — concluída | Concluído |
| Identificar a região que diverge no sinal da correlação parcial (moradia × MMGD, controle conjunto de renda e irradiação) | Uma região com sinal oposto pode indicar mecanismo distinto ou erro de dado localizado | Reexecução do script de correlação com saída desagregada por região | [responsável a definir] |
| Definir (ou descartar formalmente) um critério de corte para "alta verticalização" | Hoje a hipótese aparece na narrativa sem sustentação estatística nem classificação formal | Teste direcionado de `percentual_apartamento` como hipótese de barreira, com corte e sensibilidade | [responsável a definir] |
| ~~Resolver a divergência de 31% vs. 42,2% na intensidade financeira do Reforma Casa Brasil Solar~~ **[RESOLVIDO nos documentos-fonte internos em 26/07/2026]** — falta ainda corrigir o mesmo número no rascunho do relatório principal (`Atlas das experiências de MMGD solar...docx`, trecho citado no item 24 do Bloco 1) | Número citado publicamente em material de comunicação, com erro de cálculo aparente | Recálculo (já feito, 42,2%) e correção do rascunho externo, fora deste repositório | [responsável a definir] |
| ~~Reconciliar denominador de "municípios sem contrato" (4.476 vs. 4.480)~~ **[RESOLVIDO 26/07/2026]** — diferença de 4 municípios sem dado de irradiação (Fernando de Noronha, Boa Esperança do Norte/MT, Lagoa Mirim/Lagoa dos Patos-RS), presentes na base de precariedade mas excluídos da classificação de quadrante | Mesma base, dois números diferentes no mesmo documento | Auditoria da consulta que gera a tabela de precariedade habitacional — concluída | Concluído |
| Completar objetivos, metas territoriais e condições de crédito do Reforma Casa Brasil Solar (renda até R$ 9.600/mês e dispensa de escritura já confirmados no relatório principal; falta o restante) | Sem isso, a auditoria de aderência territorial não pode virar avaliação de eficácia | Documento oficial do programa (Caixa/Ministério das Cidades) | [responsável a definir] |
| Renomear a seção "Resultados Ineficientes de Crédito" do relatório principal (Parte III, item 4) | O título afirma "ineficiência" antes de os critérios oficiais do programa terem sido plenamente confrontados com a distribuição observada | Decisão editorial da equipe de redação | [responsável a definir] |
| Confirmar se valores financeiros do programa são nominais ou corrigidos | Afeta comparabilidade de qualquer análise temporal futura | Confirmação junto à fonte (Caixa/SIC) | [responsável a definir] |
| ~~Reconciliar escala do Índice de Segurança da Posse (0–1 vs. 0–100)~~ **[RESOLVIDO 26/07/2026]** | Necessário para descrever corretamente a fórmula do IVSH no relatório principal | Auditoria do código/schema do banco — confirmado via comentário da migration 0028: escala real é 0–100 | Concluído |

---

## BLOCO 4 — Recomendações de tabelas, mapas e gráficos

Todas as figuras abaixo são recomendações do que **pode** ser produzido a partir dos dados já descritos nos materiais — nenhuma delas existe pronta nos materiais consultados nesta sessão.

**1. Mapa nacional dos quatro quadrantes da Matriz de Vazios de Acesso**
- Objetivo: mostrar visualmente a concentração regional do Vazio de Acesso.
- Dados necessários: classificação municipal de quadrante (já existente, segundo os materiais, no banco do Atlas).
- Mensagem principal: o Vazio de Acesso não se distribui uniformemente — concentra-se no Nordeste e é ausente no Sul.
- Local de inserção: Seção 9.6 do anexo, ou corpo principal do relatório como figura de abertura do tema.
- Cuidados de interpretação: incluir nota de que a classificação é relativa (mediana nacional), não um limiar absoluto de viabilidade.

**2. Mapa dos 1.451 municípios Vazio de Acesso, com destaque para os cinco municípios de maior IVSH**
- Objetivo: visualizar a sobreposição parcial entre os dois instrumentos.
- Dados necessários: lista de códigos IBGE dos 1.451 municípios + os cinco municípios de maior IVSH (já nomeados nos materiais).
- Mensagem principal: convergência em 3 dos 5 casos, divergência nos outros 2.
- Local de inserção: Seção 13 (Leitura integrada).
- Cuidados de interpretação: deixar explícito que a ausência de destaque não significa ausência de vulnerabilidade — apenas que o município não está entre os cinco de maior IVSH nacional.

**3. Gráfico de dispersão entre índice de precariedade habitacional e MMGD residencial per capita**
- Objetivo: ilustrar visualmente a associação testada na Seção 12.
- Dados necessários: valores municipais das duas variáveis (existentes, segundo os materiais).
- Mensagem principal: relação negativa de intensidade baixa a moderada, com dispersão ampla — não uma reta perfeita.
- Local de inserção: Seção 12.5.
- Cuidados de interpretação: a associação bruta (sem controle) não deve ser confundida com a associação parcial (controlada) reportada no texto — recomenda-se apresentar as duas, claramente rotuladas.

**4. Gráfico de barras dos resultados da correlação parcial (Quadro do item 12.5), com intervalo de confiança se disponível**
- Objetivo: comunicar os dois coeficientes e sua incerteza de forma acessível a público não técnico.
- Dados necessários: coeficientes já disponíveis; intervalo de confiança não consta nos materiais — **[informação a confirmar]** antes de incluir.
- Mensagem principal: as duas associações são estatisticamente muito significativas, mas de magnitude moderada — o gráfico deve evitar sugerir visualmente um efeito maior do que o coeficiente indica.
- Local de inserção: Seção 12.7–12.8.
- Cuidados de interpretação: rotular explicitamente a escala (−1 a +1) para não sugerir que a barra ocupa uma fração maior do "efeito total" do que realmente representa.

**5. Ranking dos municípios com maior IVSH (top 20 ou mais, se os dados existirem além dos 5 já nomeados)**
- Objetivo: dar visibilidade a mais casos de vulnerabilidade combinada além dos cinco já citados.
- Dados necessários: ranking completo do IVSH — não localizado nos materiais além do top 5. **[resultado não informado]**.
- Mensagem principal: dependente dos dados a obter.
- Local de inserção: Seção 11.9–11.10.
- Cuidados de interpretação: verificar empates e critério de desempate antes de publicar qualquer posição de ranking.

**6. Mapa dos contratos do Reforma Casa Brasil Solar sobreposto à classificação de Vazio de Acesso**
- Objetivo: visualizar diretamente a baixa convergência territorial descrita na Seção 14.
- Dados necessários: geolocalização municipal dos 1.093 municípios com contrato (existente, segundo os materiais) + classificação de quadrante.
- Mensagem principal: presença de contratos não se concentra nos municípios Vazio de Acesso.
- Local de inserção: Seção 14.4, ou corpo principal do relatório.
- Cuidados de interpretação: usar frequência (presença/ausência de contrato), não valor absoluto, para não distorcer a leitura visual a favor de municípios grandes.

**7. Gráfico de comparação de recursos por quadrante (barras, valores per capita)**
- Objetivo: comunicar a Seção 14.5 de forma direta.
- Dados necessários: já disponíveis (Quadro da Seção 14.5).
- Mensagem principal: menor intensidade financeira per capita em Vazio de Acesso — usar o valor recalculado e sinalizar a divergência com a fonte original em nota de rodapé do próprio gráfico, não silenciosamente.
- Local de inserção: Seção 14.5.
- Cuidados de interpretação: evitar incluir os casos extremos (Jaboatão dos Guararapes, São João do Piauí) no mesmo gráfico da média nacional sem rotulá-los claramente como ilustrativos, não representativos.

**8. Comparação entre municípios com e sem contrato (precariedade habitacional, Seção 14.7)**
- Objetivo: comunicar a diferença de médias entre os dois grupos.
- Dados necessários: já disponíveis, mas com a inconsistência de denominador (4.476 vs. 4.480) a resolver antes da publicação.
- Mensagem principal: contratos correlacionam com precariedade média maior, mas isso não se traduz em maior presença nos Vazios de Acesso — recomenda-se um gráfico combinado (barras pareadas) que mostre as duas leituras lado a lado para evitar a leitura simplificada de "o programa já prioriza vulnerabilidade".
- Local de inserção: Seção 14.7.
- Cuidados de interpretação: rotular como comparação de médias descritivas, sem teste de significância.

**9. Fluxograma da metodologia dos três instrumentos**
- Objetivo: dar ao leitor não técnico uma visão de conjunto de como os três instrumentos se relacionam (Seção 5).
- Dados necessários: nenhum dado adicional — é uma representação da arquitetura conceitual já descrita neste anexo.
- Mensagem principal: os três instrumentos usam fontes e critérios parcialmente distintos e não são substitutos um do outro.
- Local de inserção: abertura do anexo (Seção 5) ou corpo principal do relatório, como figura introdutória.
- Cuidados de interpretação: nenhum — é uma figura estrutural, não estatística.

Figuras mencionadas na tarefa original que **não são recomendadas neste bloco** por falta de dado correspondente nos materiais: mapa de precariedade construtiva isolado e mapa de verticalização isolado (os dados existem como variáveis, mas não como classificação territorial com corte definido, especialmente no caso de verticalização — Seção 10.3); mapa de sobreposição Vazio de Acesso × IVSH em versão completa (só é possível para os 5 municípios nomeados, não para o universo completo, sem o ranking total do IVSH).

---

## BLOCO 5 — Referência ao anexo no relatório principal

**Esta seção foi atualizada após a leitura do rascunho real do relatório principal (`Atlas das experiências de MMGD solar...docx`).** O relatório principal, no estado em que foi encontrado, já contém a metodologia e os resultados completos dos três instrumentos diretamente no corpo do texto, na seção "PARTE III – A Lente Territorial e Estrutural do Atlas Solar Justo" (itens 1 a 4, da Matriz de Vazios de Acesso à auditoria do Reforma Casa Brasil Solar) — o oposto da arquitetura editorial que esta tarefa pede (anexo separado + síntese no corpo). A recomendação abaixo é **substituir integralmente essa seção** pelo texto de síntese sugerido, e mover o conteúdo completo — que já está preservado, verificado e requalificado neste anexo (Bloco 2, Seções 9 a 14) — para o anexo técnico.

**Local recomendado para inserção/substituição:** no lugar da atual seção "PARTE III – A Lente Territorial e Estrutural do Atlas Solar Justo" (a que antecede "PARTE III – Evidências Empíricas" — ver Bloco 1, item 28a, sobre a duplicação de numeração que essa substituição também resolve).

**Texto pronto para copiar e colar, substituindo a seção atual:**

> ### A Lente Territorial e Estrutural do Atlas Solar Justo
>
> Para transformar o diagnóstico de barreira habitacional em um instrumento de priorização territorial, o Instituto Pólis desenvolveu três instrumentos analíticos, aplicados aos cerca de 5.570 municípios brasileiros: a **Matriz de Vazios de Acesso**, que classifica municípios pelo cruzamento entre potencial de irradiação solar e adoção residencial efetiva de energia solar, identificando 1.451 municípios (26,1% do total classificável) onde o sol é abundante mas a adoção permanece baixa — fortemente concentrados no Nordeste (77,4% dos casos); o **Descompasso Morfológico**, que qualifica territórios onde a própria morfologia construtiva das moradias — precariedade física, e possivelmente também tipologia habitacional — pode impedir fisicamente a instalação individual de painéis, independentemente de crédito disponível; e o **Índice de Vulnerabilidade Sócio-Habitacional-Energética (IVSH)**, métrica original que combina vulnerabilidade social, precariedade da moradia e insegurança da posse da terra num único número de priorização, capaz de identificar vulnerabilidade mesmo em municípios que a Matriz de Vazios de Acesso não capturaria isoladamente.
>
> Um teste estatístico controlado (correlação parcial, controlando renda e irradiação solar simultaneamente) confirma que a precariedade habitacional está associada a menor adoção solar residencial de forma independente da renda e do sol disponíveis — associação de intensidade moderada, mas estatisticamente muito robusta (p ≈ 2,7×10⁻³⁰), consistente em quatro das cinco regiões do país.
>
> Esses instrumentos foram aplicados à auditoria territorial do Reforma Casa Brasil Solar, o principal programa federal de crédito habitacional com componente solar identificado nesta pesquisa: os resultados indicam baixa convergência entre a distribuição observada de contratos e recursos e os municípios prioritários da Matriz de Vazios de Acesso — o programa está proporcionalmente mais presente, e chega com maior intensidade financeira por habitante, onde a adoção solar já é alta, e municípios de alta vulnerabilidade como Aldeias Altas, Buriti e Mirador (MA) não registraram nenhum contrato no período analisado.
>
> A Matriz de Vazios de Acesso, o Descompasso Morfológico e o IVSH são metodologias próprias e pioneiras do Instituto Pólis, construídas com dados públicos (ANEEL, IBGE/Censo 2022, INPE/LABREN, RAIS) e procedimentos estatísticos verificáveis — mas ainda não submetidas a validação externa por pares. A metodologia completa, os resultados estatísticos detalhados por região, os limites de cada leitura e os pontos que permanecem pendentes de confirmação estão descritos no Anexo Técnico — Metodologia, Resultados Empíricos e Auditoria Territorial, que acompanha esta publicação.

**Nota sobre o texto acima:** ele evita deliberadamente citar os números per capita do Reforma Casa Brasil Solar com precisão de duas casas decimais (Seção 14.5) porque um desses números (a comparação "31% menor") está com erro de cálculo no material atual (Bloco 1, itens 1 e 24) — recomenda-se resolver essa pendência (Quadro 5) antes de decidir se algum valor per capita específico deve voltar ao corpo do texto.

---

## BLOCO 6 — Resultados que devem aparecer no relatório principal

Cinco achados selecionados por relevância e solidez da evidência disponível:

**1. Resultado:** a precariedade habitacional está associada a menor adoção de energia solar residencial, mesmo controlando renda e irradiação (ρ parcial = −0,1524; p ≈ 2,7×10⁻³⁰; robusto em 4 das 5 regiões).
**Razão para aparecer no texto principal:** é o achado estatístico central que sustenta a tese de moradia como barreira independente — a espinha dorsal do argumento institucional do Atlas.
**Formulação recomendada:** *"Municípios com moradias mais precárias têm, em média, menor adoção de energia solar residencial — mesmo comparando municípios com renda e potencial solar semelhantes. A associação é estatisticamente muito significativa, ainda que de intensidade moderada."*
**Cuidado de interpretação:** não usar "prova" ou "causa"; explicitar que o modelo não isola o mecanismo físico específico da barreira.

**2. Resultado:** a Matriz de Vazios de Acesso identificou 1.451 municípios (26,1% do universo classificável) onde o potencial solar é alto mas a adoção residencial é baixa, com concentração de 77,4% desses casos no Nordeste.
**Razão para aparecer no texto principal:** é o resultado territorial mais direto e visualmente comunicável dos três instrumentos.
**Formulação recomendada:** *"Um em cada quatro municípios brasileiros tem sol em abundância e pouquíssima energia solar instalada em residências — um padrão fortemente concentrado no Nordeste."*
**Cuidado de interpretação:** acompanhar sempre da ressalva de que o corte não controla renda, para não sugerir que a causa é exclusivamente habitacional.

**3. Resultado:** o Reforma Casa Brasil Solar concentra recursos e contratos, proporcionalmente, nos municípios que já têm melhor acesso solar — Vazios de Acesso recebem menos contratos proporcionalmente (20,8% vs. 27,3%) e menos recurso per capita.
**Razão para aparecer no texto principal:** é a evidência direta de auditoria de política pública, com implicação prática imediata.
**Formulação recomendada:** *"O principal programa de crédito habitacional com componente solar identificado nesta análise reforça, até aqui, o padrão espacial de acesso já existente, em vez de corrigi-lo."*
**Cuidado de interpretação:** não afirmar "ineficiência comprovada" nem "falha do programa" — os objetivos e critérios oficiais do programa não foram confirmados nos materiais disponíveis; usar "baixa convergência territorial" e citar isso como limitação explícita.

**4. Resultado:** o IVSH identificou municípios de vulnerabilidade sócio-habitacional aguda (como Alto Alegre e Cumaru do Norte) que a Matriz de Vazios de Acesso, isoladamente, não captaria, por dependerem de irradiação abaixo da mediana nacional.
**Razão para aparecer no texto principal:** demonstra de forma concreta por que os três instrumentos são complementares, não redundantes — argumento central da arquitetura analítica do Atlas.
**Formulação recomendada:** *"Nem toda vulnerabilidade energético-habitacional aparece onde o sol é mais forte — o IVSH identifica municípios de alta vulnerabilidade que ficariam invisíveis a um critério baseado só em potencial solar desperdiçado."*
**Cuidado de interpretação:** mencionar que o IVSH ainda não passou por validação externa por pares — é metodologia própria e pioneira do Instituto Pólis.

**5. Resultado:** o sinal do coeficiente da variável de segurança da posse da terra (ρ parcial = −0,2976) foi oposto ao hipotetizado — mais posse própria associou-se, controlando renda e irradiação, a menor adoção solar residencial.
**Razão para aparecer no texto principal:** é um achado inesperado que os materiais preservam sem suavizar, e que a metodologia deste anexo recomenda manter visível — omiti-lo enfraqueceria a credibilidade do restante da análise.
**Formulação recomendada:** *"Um resultado não previsto pela hipótese original: controlando renda e sol disponível, municípios com maior segurança da posse da terra tiveram, em média, menor adoção solar residencial — um padrão ainda sem explicação confirmada, possivelmente ligado à composição urbana das áreas de aluguel."*
**Cuidado de interpretação:** apresentar explicitamente como resultado inesperado e não explicado, não encaixá-lo forçadamente na narrativa de "moradia como barreira".

---

## BLOCO 7 — Orientações editoriais e pendências

**Trechos fundidos:** as descrições da Matriz de Vazios de Acesso, do Descompasso Morfológico e do IVSH, que apareciam de forma parcialmente duplicada entre o Relatório de Auditoria (voltado à engenharia de dados) e o Sumário Executivo (voltado a tomadores de decisão), foram unificadas numa única descrição por instrumento neste anexo, preservando os números de ambos quando coincidentes e sinalizando divergências quando não coincidiam (ex.: mediana de irradiação 5,02 vs. 5,015 kWh/m²/dia — tratada como diferença de arredondamento, não de fonte).

**Repetições eliminadas:** a narrativa de "moradia como pré-condição, não substituta da renda" aparecia de forma quase idêntica em ambos os documentos-fonte — mantida uma única vez, na Seção 4 do anexo (Referencial conceitual).

**Afirmações suavizadas:** "prova"/"comprova"/"atesta matematicamente" substituídos por "indica"/"é compatível com"/"reforça a hipótese de"; o termo "ortogonalidade" (usado sem teste formal) removido; "ineficiência comprovada" do programa substituído por "baixa convergência territorial"; a afirmação de que o Atlas "validou" seus instrumentos foi qualificada como validação interna, não externa/por pares.

**Informações mantidas apenas no anexo, não no corpo principal do relatório:** a tabela completa de correlação parcial com controles (Seção 12.5), os quadros de rastreabilidade (Quadro 4) e de pendências (Quadro 5), a descrição completa da metodologia de normalização e ponderação do IVSH, e o detalhamento das seis inconsistências numéricas identificadas no Bloco 1.

**Lacunas metodológicas identificadas, sem solução possível apenas com os materiais desta sessão:** ausência de um critério formal de corte para verticalização; região divergente do teste de correlação parcial não nomeada. (Escala do índice de segurança da posse e universo do IVSH — ambos reconciliados em 26/07/2026 por investigação direta no banco local, ver Bloco 1, itens 2, 3 e 4.)

**Verificações necessárias antes da publicação, em ordem de prioridade sugerida:**
1. ~~Recalcular e corrigir a divergência de 31% vs. 42,2% na intensidade financeira do Reforma Casa Brasil Solar (Seção 14.5)~~ **[RESOLVIDO 26/07/2026]** — corrigido para 42,2% em `RELATORIO_AUDITORIA_MORADIA_SOLAR.md`, Achado 2, Seção 3.3.
2. ~~Reconciliar o denominador de "municípios sem contrato" (4.476 vs. 4.480).~~ **[RESOLVIDO 26/07/2026]**
3. ~~Auditar a query/script que gera o universo de 5.573 municípios do IVSH.~~ **[RESOLVIDO 26/07/2026]**
4. ~~Confirmar a escala real (0–1 ou 0–100) do índice de segurança da posse, tal como persistida no banco.~~ **[RESOLVIDO 26/07/2026]** — 0–100, confirmado no comentário da migration 0028.
5. Obter, junto à Caixa Econômica Federal ou ao Ministério das Cidades, os objetivos oficiais e critérios de elegibilidade do Reforma Casa Brasil Solar.

**Análises adicionais recomendadas:** teste estatístico formal de corte/sensibilidade para a hipótese de verticalização; diagnóstico nominal da região divergente na correlação parcial de três variáveis; cruzamento numérico direto entre IVSH e cobertura do Reforma Casa Brasil Solar (hoje só indireto, por meio de casos individuais).

**Referências a conferir:** nenhuma referência bibliográfica externa foi localizada nos materiais consultados nesta sessão — qualquer citação acadêmica ou institucional a ser incluída no relatório final (por exemplo, eventual comparação metodológica com o Observatório Brasileiro de Erradicação da Pobreza Energética, mencionado em um dos materiais como possível parceiro futuro, não como fonte já incorporada) precisa ser obtida e verificada separadamente — não foi inventada nem presumida neste anexo.
