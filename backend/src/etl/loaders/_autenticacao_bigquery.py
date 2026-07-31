"""
Helper de autenticação BigQuery — usado por extrair_renda_trabalho_rais.py e
extrair_capital_humano_mortalidade_infantil.py (os 2 únicos extractors que
dependem de BigQuery).

LOCAL (ambiente de desenvolvimento, como já documentado no README/CLAUDE.md):
usa a credencial padrão do usuário (`gcloud auth application-default
login`) — este helper não muda esse fluxo em nada, só entra em ação quando
detecta a variável de produção abaixo.

PRODUÇÃO / QUALQUER AMBIENTE SEM GCLOUD INTERATIVO (Railway, ou o que o
Instituto Pólis usar depois do handoff): a forma correta de autenticar um
servidor no Google Cloud é Service Account, não o fluxo interativo de login
(que abre navegador — não existe em servidor). Este helper lê o conteúdo
JSON INTEIRO da chave da service account da variável de ambiente
GOOGLE_APPLICATION_CREDENTIALS_JSON, grava num arquivo temporário e aponta
GOOGLE_APPLICATION_CREDENTIALS pra ele — é o mecanismo NATIVO de resolução
de credencial do google-cloud (Application Default Credentials), então
NENHUMA chamada bigquery.Client() precisa mudar em nenhum dos dois scripts.

Passo a passo de como gerar essa credencial (pensado pra ser reproduzível
pelo Instituto Pólis, sem depender de mais ninguém): ver
docs/DEPLOY_TEMPORARIO.md, seção "Credencial do BigQuery (RAIS/Mortalidade
Infantil)".
"""

import os
import tempfile


def preparar_credencial_gcp() -> None:
    """Chamar uma vez, no início do script, ANTES de instanciar bigquery.Client()."""
    if os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        return  # já configurado explicitamente — não sobrescreve

    credencial_json = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS_JSON")
    if not credencial_json:
        return  # sem credencial de produção — segue o fluxo ADC padrão (gcloud local)

    arquivo_temp = tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, encoding="utf-8"
    )
    try:
        arquivo_temp.write(credencial_json)
    finally:
        arquivo_temp.close()

    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = arquivo_temp.name
    print("      [INFO] Credencial GCP carregada de GOOGLE_APPLICATION_CREDENTIALS_JSON "
          "(modo produção/service account).")
