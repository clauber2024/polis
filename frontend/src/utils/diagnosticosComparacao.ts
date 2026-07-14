import type { MunicipioClassificado, MunicipioComIndicadores } from '../types/api';
import type { IndicadorComparavel } from './indicadoresComparacao';

export interface DiagnosticoComparacao {
  alertas: string[];
  interpretacoes: string[];
}

/**
 * RF-051 — "leitura analítica" do Painel Analítico (12/07/2026). Regras
 * determinísticas em TypeScript (sem IA generativa), inspiradas no padrão do
 * protótipo visual do AI Studio (clauber2024/Atlas-Solar), mas reescritas
 * para usar só dado real: o protótipo tinha um limiar absoluto sem nenhuma
 * calibração (`potCapita > 15 && ivs < 0.25` → "polo desenvolvido, não
 * precisa de intervenção prioritária") — isso é uma afirmação forte demais
 * para nascer de um número inventado. Aqui, toda interpretação é RELATIVA ao
 * grupo comparado (maior/menor dentro do conjunto selecionado) ou vem pronta
 * do backend (classificação de Vazio de Acesso) — nunca um limiar novo
 * inventado no frontend, mesmo princípio de nunca fabricar indicador sem
 * fonte real já seguido em indicadoresIndisponiveis/notasAusencia.ts.
 */
export function gerarDiagnosticos(
  municipios: MunicipioComIndicadores[],
  indicadores: IndicadorComparavel[],
  classificacoes: Map<string, MunicipioClassificado> | null,
): DiagnosticoComparacao {
  const alertas: string[] = [];
  const interpretacoes: string[] = [];

  if (municipios.length < 2) return { alertas, interpretacoes };

  // 1. Diferença de escala populacional — populacaoEstimada é ESTIMATIVA
  // (densidade × área, ver types/api.ts), mas serve bem para este alerta.
  const comPopulacao = municipios.filter(
    (m): m is MunicipioComIndicadores & { populacaoEstimada: number } =>
      m.populacaoEstimada !== null,
  );
  if (comPopulacao.length >= 2) {
    const maior = comPopulacao.reduce((a, b) => (b.populacaoEstimada > a.populacaoEstimada ? b : a));
    const menor = comPopulacao.reduce((a, b) => (b.populacaoEstimada < a.populacaoEstimada ? b : a));
    if (menor.populacaoEstimada > 0 && maior.populacaoEstimada / menor.populacaoEstimada > 10) {
      alertas.push(
        `Diferença de escala: ${maior.nome} (${maior.populacaoEstimada.toLocaleString('pt-BR')} hab. estimados) ` +
          `é mais de 10× maior que ${menor.nome} (${menor.populacaoEstimada.toLocaleString('pt-BR')} hab.). ` +
          'Prefira indicadores per capita (ex.: MMGD residencial per capita) a valores absolutos nesta comparação.',
      );
    }
  }

  // 2. Amplitude de irradiação solar — só avalia se o indicador está entre
  // os selecionados pelo usuário (checkboxes do painel).
  if (indicadores.some((i) => i.id === 'irradiacaoMediaKwhM2Dia')) {
    const valores = municipios
      .map((m) => m.irradiacaoMediaKwhM2Dia)
      .filter((v): v is number => typeof v === 'number');
    if (valores.length >= 2) {
      const amplitude = Math.max(...valores) - Math.min(...valores);
      // 1,8 kWh/m²·dia é uma heurística de leitura rápida (mesma ordem de
      // grandeza da variação Norte-Sul do país), não um valor calibrado.
      if (amplitude > 1.8) {
        alertas.push(
          `Amplitude climática alta: a irradiação solar varia ${amplitude.toFixed(2)} kWh/m²·dia ` +
            'entre os municípios comparados — políticas de transição energética em locais de baixa ' +
            'insolação tendem a depender mais de subsídio tarifário do que de investimento em painel.',
        );
      }
    }
  }

  // 3. Dados incompletos entre os indicadores selecionados.
  const comLacuna = municipios.filter((m) => indicadores.some((ind) => m[ind.id] === null));
  if (comLacuna.length > 0) {
    alertas.push(
      `Dado incompleto: ${comLacuna.map((m) => m.nome).join(', ')} ` +
        `${comLacuna.length === 1 ? 'tem' : 'têm'} ao menos um indicador selecionado sem valor — ` +
        'reflete lacuna real da fonte oficial (ver painel de detalhe do município), não erro de carga.',
    );
  }

  // 4. Classificação de Vazio de Acesso — vem PRONTA do backend
  // (GET /api/vazios-de-acesso/classificar), nunca recalculada aqui.
  for (const municipio of municipios) {
    const classificacao = classificacoes?.get(municipio.codigoIbge);
    if (classificacao?.quadrante === 'vazio_de_acesso') {
      interpretacoes.push(
        `${municipio.nome} (${municipio.uf}) é classificado pelo backend como ` +
          `${classificacao.quadranteRotulo ?? 'Vazio de Acesso'} — alto potencial solar e alta ` +
          'vulnerabilidade social combinados com baixa adoção de MMGD residencial ' +
          '(ver metodologia em ARQUITETURA.md).',
      );
    }
  }

  // 5. Referência positiva RELATIVA ao grupo: o mesmo município é o de maior
  // MMGD residencial per capita E o de menor IVS entre os comparados — nunca
  // um limiar absoluto, só uma comparação dentro do próprio conjunto.
  const comMmgdEIvs = municipios.filter(
    (m): m is MunicipioComIndicadores & { mmgdResidencialPer1000Hab: number; ivs: number } =>
      m.mmgdResidencialPer1000Hab !== null && m.ivs !== null,
  );
  if (comMmgdEIvs.length >= 2) {
    const maiorMmgd = comMmgdEIvs.reduce((a, b) =>
      b.mmgdResidencialPer1000Hab > a.mmgdResidencialPer1000Hab ? b : a,
    );
    const menorIvs = comMmgdEIvs.reduce((a, b) => (b.ivs < a.ivs ? b : a));
    if (maiorMmgd.codigoIbge === menorIvs.codigoIbge) {
      interpretacoes.push(
        `${maiorMmgd.nome} (${maiorMmgd.uf}) tem, ao mesmo tempo, a maior adoção de MMGD ` +
          'residencial per capita e o menor IVS entre os municípios comparados.',
      );
    }
  }

  return { alertas, interpretacoes };
}
