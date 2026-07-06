"""
INSPEÇÃO (não grava nada): confirma, via metadado real da API, se existem
tabelas do Censo 2022/SIDRA com nível municipal para valor de aluguel e para
renda domiciliar — antes de decidir como calcular "ônus excessivo com
aluguel" no Atlas.

O plano docs/PLANO_MORADIA_TERRITORIO_POPULAR.md cita "Tabela 287/438" como
fonte, mas esses números são baixos demais para o padrão de numeracao do
Censo 2022 usado no resto do projeto (Tabela 9928, 9923, 9888...) — parecem
ser tabelas legadas do Censo 2010, nunca confirmadas. Candidatos reais de
Censo 2022 encontrados via busca (precisam confirmação via metadado, mesmo
cuidado ja documentado para o caso TSEE em ARQUITETURA.md):
  - 3524: Domicílios alugados, por classes de ALUGUEL nominal mensal
  - 3168: Domicílios, total e com RENDIMENTO domiciliar (valor médio/mediano)
  - 3261: Domicílios por classes de RENDIMENTO domiciliar per capita

Nenhuma tabela encontrada até agora cruza aluguel x rendimento na MESMA
tabela — o que sugere que "ônus excessivo" pode precisar ser aproximado a
partir de duas tabelas separadas (aluguel médio x renda média por
município), não um percentual direto de "domicílios que gastam >30% da
renda com aluguel" pronto no SIDRA agregado.
"""

import requests

TABELAS = {
    3524: "Domicílios alugados, por classes de aluguel nominal mensal",
    3168: "Domicílios, total e com rendimento domiciliar",
    3261: "Domicílios por classes de rendimento nominal mensal domiciliar per capita",
}

for codigo, descricao in TABELAS.items():
    url = f"https://servicodados.ibge.gov.br/api/v3/agregados/{codigo}/metadados"
    print("=" * 78)
    print(f"Tabela {codigo}: {descricao}")
    print(f"Consultando: {url}")
    try:
        resposta = requests.get(url, timeout=60)
        resposta.raise_for_status()
        dados = resposta.json()
    except Exception as e:
        print(f"[ERRO] Falhou: {e}")
        continue

    print(f"Nome oficial: {dados.get('nome')}")
    print(f"Níveis territoriais disponíveis: {dados.get('nivelTerritorial')}")
    print(f"Períodos disponíveis (frequência {dados.get('periodicidade', {}).get('frequencia')}): "
          f"{dados.get('periodicidade', {}).get('inicio')} a {dados.get('periodicidade', {}).get('fim')}")

    print("\nVariáveis:")
    for variavel in dados.get("variaveis", []):
        print(f"  {variavel['id']:>6}  {variavel['nome']} ({variavel.get('unidade')})")

    print("\nClassificações:")
    for classificacao in dados.get("classificacoes", []):
        print(f"  === Classificação {classificacao['id']}: {classificacao['nome']} ===")
        for categoria in classificacao.get("categorias", []):
            print(f"      {categoria['id']:>10}  {categoria['nome']}")
    print()
