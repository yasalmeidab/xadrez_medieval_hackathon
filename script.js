'use strict';

/* ============================================================
   UTILIDADES
   ============================================================ */
/* Atalhos, constantes e componentes de interface compartilhados (diálogo, aviso). */

const $ = id => document.getElementById(id);
const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));
const esperar = ms => new Promise(ok => setTimeout(ok, ms));
const movimentoReduzido = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const COLUNAS = 'abcdefgh';
const nomeCasa = (r, c) => COLUNAS[c] + (8 - r);
const outraCor = cor => (cor === 'w' ? 'b' : 'w');

const VALOR_PECA = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };
const NOME_PECA = { K: 'Rei', Q: 'Dama', R: 'Torre', B: 'Bispo', N: 'Cavalo', P: 'Peão' };
const NOME_REINO = { w: 'Reino Branco', b: 'Reino Negro' };
const LEMA_PECA = {
  K: 'A peça que deve ser protegida a qualquer custo.',
  Q: 'A soberana do reino.',
  R: 'Guardiã das muralhas.',
  B: 'Estrategista do reino.',
  N: 'Especialista em ataques inesperados.',
  P: 'O soldado que avança pelo reino.'
};
const MENSAGEM_BOT = {
  facil: 'O adversário ainda está aprendendo...',
  medio: 'O reino inimigo está analisando o tabuleiro.',
  dificil: 'O adversário está calculando sua próxima jogada.'
};
const NOME_NIVEL = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' };

/* ---------- Diálogo modal (confirmações e promoção) ---------- */
const Dialogo = (() => {
  let resolver = null;
  let focoAnterior = null;

  function fechar(valor) {
    if (!resolver) return;
    $('dialogo').hidden = true;
    const r = resolver;
    resolver = null;
    if (focoAnterior && focoAnterior.focus) focoAnterior.focus();
    r(valor);
  }

  // abrir({titulo, corpo (HTML), botoes:[{texto, valor, alt, html}], cancelavel}) -> Promise<valor|null>
  function abrir({ titulo, corpo = '', botoes = [], cancelavel = true, classe = '' }) {
    if (resolver) fechar(null);
    focoAnterior = document.activeElement;
    $('dialogo-titulo').textContent = titulo;
    $('dialogo-corpo').innerHTML = corpo;
    const caixa = $('dialogo-botoes');
    caixa.innerHTML = '';
    caixa.className = 'linha-botoes ' + classe;
    botoes.forEach(b => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'placa' + (b.alt ? ' alt' : '') + (b.classe ? ' ' + b.classe : '');
      if (b.html) el.innerHTML = b.html; else el.textContent = b.texto;
      if (b.rotulo) el.setAttribute('aria-label', b.rotulo);
      el.addEventListener('click', () => fechar(b.valor));
      caixa.appendChild(el);
    });
    $('dialogo').dataset.cancelavel = cancelavel ? '1' : '0';
    $('dialogo').hidden = false;
    const primeiro = caixa.querySelector('button');
    if (primeiro) primeiro.focus();
    if (typeof Sons !== 'undefined') Sons.tocar('abrir');
    return new Promise(ok => { resolver = ok; });
  }

  function confirmar(titulo, texto) {
    return abrir({
      titulo,
      corpo: `<p>${texto}</p>`,
      botoes: [{ texto: 'Sim', valor: true }, { texto: 'Cancelar', valor: false, alt: true }]
    }).then(v => v === true);
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && resolver && $('dialogo').dataset.cancelavel === '1') fechar(null);
  });

  return { abrir, confirmar, fechar, aberto: () => !!resolver };
})();

/* ---------- Aviso flutuante (mensagens curtas, easter eggs) ---------- */
let avisoTimer = null, avisoSumir = null;
function aviso(html, ms = 3500, classe = '') {
  const el = $('aviso');
  clearTimeout(avisoSumir); // um aviso novo cancela o sumiço do anterior
  el.innerHTML = html;
  el.className = 'aviso ' + classe;
  el.hidden = false;
  // reinicia a animação de entrada
  void el.offsetWidth;
  el.classList.add('visivel');
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => {
    el.classList.remove('visivel');
    avisoSumir = setTimeout(() => { el.hidden = true; }, 400);
  }, ms);
}

/* ============================================================
   REGRAS
   ============================================================ */
/* Motor de regras puro: não toca no DOM nem no estado global.
   Uma "posição" (pos) tem:
     board[r][c]        'wP', 'bK'... ou null (r = 0 é a fileira 8; c = 0 é a coluna a)
     currentTurn        'w' | 'b'
     castlingRights     { wK, wQ, bK, bQ } (true = roque ainda permitido)
     enPassantTarget    [r, c] da casa que pode ser capturada en passant, ou null
     halfmoveClock      lances desde a última captura ou movimento de peão (regra dos 50 lances)
     fullmoveNumber
     whiteKingPosition / blackKingPosition  [r, c]
   Um lance (mv) é { fr, fc, r, c, f, promo }:
     f = 'dbl' (avanço duplo) | 'ep' (en passant) | 'ck' (roque curto) | 'cq' (roque longo) | undefined
     promo = 'Q' | 'R' | 'B' | 'N' quando um peão chega à última fileira. */

const Regras = (() => {
  const CAVALO = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const REI = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const dentro = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
  const em = (b, r, c) => (dentro(r, c) ? b[r][c] : null);

  function inicial() {
    const fundo = 'RNBQKBNR';
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (let c = 0; c < 8; c++) {
      board[0][c] = 'b' + fundo[c];
      board[1][c] = 'bP';
      board[6][c] = 'wP';
      board[7][c] = 'w' + fundo[c];
    }
    return {
      board,
      currentTurn: 'w',
      castlingRights: { wK: true, wQ: true, bK: true, bQ: true },
      enPassantTarget: null,
      halfmoveClock: 0,
      fullmoveNumber: 1,
      whiteKingPosition: [7, 4],
      blackKingPosition: [0, 4]
    };
  }

  function copiar(pos) {
    return {
      board: pos.board.map(l => l.slice()),
      currentTurn: pos.currentTurn,
      castlingRights: { ...pos.castlingRights },
      enPassantTarget: pos.enPassantTarget ? pos.enPassantTarget.slice() : null,
      halfmoveClock: pos.halfmoveClock,
      fullmoveNumber: pos.fullmoveNumber,
      whiteKingPosition: pos.whiteKingPosition.slice(),
      blackKingPosition: pos.blackKingPosition.slice()
    };
  }

  const posRei = (pos, cor) => (cor === 'w' ? pos.whiteKingPosition : pos.blackKingPosition);

  // Alguma peça da cor "por" ataca a casa (r, c)?
  function atacada(b, r, c, por) {
    const d = por === 'w' ? 1 : -1; // peões brancos atacam "para cima" (r diminui)
    if (em(b, r + d, c - 1) === por + 'P' || em(b, r + d, c + 1) === por + 'P') return true;
    for (const [dr, dc] of CAVALO) if (em(b, r + dr, c + dc) === por + 'N') return true;
    for (const [dr, dc] of REI) {
      if (em(b, r + dr, c + dc) === por + 'K') return true;
      const reta = dr === 0 || dc === 0;
      let i = r + dr, j = c + dc;
      while (dentro(i, j)) {
        const p = b[i][j];
        if (p) {
          if (p[0] === por && (p[1] === 'Q' || (reta ? p[1] === 'R' : p[1] === 'B'))) return true;
          break;
        }
        i += dr; j += dc;
      }
    }
    return false;
  }

  function emXeque(pos, cor) {
    const [r, c] = posRei(pos, cor);
    return atacada(pos.board, r, c, outraCor(cor));
  }

  // Movimentos da peça em (r, c) sem verificar se deixam o próprio rei em xeque.
  function pseudo(pos, r, c) {
    const b = pos.board, p = b[r][c];
    if (!p) return [];
    const cor = p[0], tipo = p[1], adv = outraCor(cor), saida = [];
    const add = (i, j, f) => {
      if (tipo === 'P' && (i === 0 || i === 7)) {
        for (const promo of ['Q', 'R', 'B', 'N']) saida.push({ fr: r, fc: c, r: i, c: j, f, promo });
      } else saida.push({ fr: r, fc: c, r: i, c: j, f });
    };

    if (tipo === 'P') {
      const d = cor === 'w' ? -1 : 1, inicio = cor === 'w' ? 6 : 1;
      if (dentro(r + d, c) && !b[r + d][c]) {
        add(r + d, c);
        if (r === inicio && !b[r + 2 * d][c]) add(r + 2 * d, c, 'dbl');
      }
      for (const dc of [-1, 1]) {
        const i = r + d, j = c + dc;
        if (!dentro(i, j)) continue;
        if (b[i][j] && b[i][j][0] === adv) add(i, j);
        else if (pos.enPassantTarget && pos.enPassantTarget[0] === i && pos.enPassantTarget[1] === j) add(i, j, 'ep');
      }
    } else if (tipo === 'N' || tipo === 'K') {
      for (const [dr, dc] of tipo === 'N' ? CAVALO : REI) {
        const i = r + dr, j = c + dc;
        if (dentro(i, j) && (!b[i][j] || b[i][j][0] === adv)) add(i, j);
      }
      const linha = cor === 'w' ? 7 : 0;
      if (tipo === 'K' && r === linha && c === 4 && !atacada(b, linha, 4, adv)) {
        const dir = pos.castlingRights;
        if (dir[cor + 'K'] && !b[linha][5] && !b[linha][6] && b[linha][7] === cor + 'R' &&
            !atacada(b, linha, 5, adv) && !atacada(b, linha, 6, adv)) add(linha, 6, 'ck');
        if (dir[cor + 'Q'] && !b[linha][1] && !b[linha][2] && !b[linha][3] && b[linha][0] === cor + 'R' &&
            !atacada(b, linha, 3, adv) && !atacada(b, linha, 2, adv)) add(linha, 2, 'cq');
      }
    } else {
      for (const [dr, dc] of REI) {
        if (tipo === 'R' && dr !== 0 && dc !== 0) continue;
        if (tipo === 'B' && (dr === 0 || dc === 0)) continue;
        let i = r + dr, j = c + dc;
        while (dentro(i, j)) {
          if (!b[i][j]) add(i, j);
          else { if (b[i][j][0] === adv) add(i, j); break; }
          i += dr; j += dc;
        }
      }
    }
    return saida;
  }

  // Casa da peça capturada pelo lance (diferente do destino no en passant), ou null.
  function casaCapturada(pos, mv) {
    if (mv.f === 'ep') return [mv.fr, mv.c];
    return pos.board[mv.r][mv.c] ? [mv.r, mv.c] : null;
  }

  // Aplica o lance e devolve uma NOVA posição (a original não é alterada).
  function aplicar(pos, mv) {
    const n = copiar(pos), b = n.board;
    const p = b[mv.fr][mv.fc], cor = p[0], tipo = p[1];
    const capturou = !!casaCapturada(pos, mv);

    b[mv.r][mv.c] = mv.promo ? cor + mv.promo : p;
    b[mv.fr][mv.fc] = null;
    if (mv.f === 'ep') b[mv.fr][mv.c] = null;
    if (mv.f === 'ck') { b[mv.r][5] = b[mv.r][7]; b[mv.r][7] = null; }
    if (mv.f === 'cq') { b[mv.r][3] = b[mv.r][0]; b[mv.r][0] = null; }

    if (tipo === 'K') {
      n.castlingRights[cor + 'K'] = n.castlingRights[cor + 'Q'] = false;
      if (cor === 'w') n.whiteKingPosition = [mv.r, mv.c]; else n.blackKingPosition = [mv.r, mv.c];
    }
    // torre saiu ou foi capturada no canto: perde o roque daquele lado
    for (const [sr, sc, k] of [[7, 0, 'wQ'], [7, 7, 'wK'], [0, 0, 'bQ'], [0, 7, 'bK']]) {
      if ((mv.fr === sr && mv.fc === sc) || (mv.r === sr && mv.c === sc)) n.castlingRights[k] = false;
    }
    n.enPassantTarget = mv.f === 'dbl' ? [(mv.fr + mv.r) / 2, mv.fc] : null;
    n.halfmoveClock = tipo === 'P' || capturou ? 0 : pos.halfmoveClock + 1;
    if (cor === 'b') n.fullmoveNumber++;
    n.currentTurn = outraCor(cor);
    return n;
  }

  function deixaReiSeguro(pos, mv) {
    const cor = pos.board[mv.fr][mv.fc][0];
    return !emXeque(aplicar(pos, mv), cor);
  }

  // Lances legais da peça em (r, c).
  function legais(pos, r, c) {
    return pseudo(pos, r, c).filter(mv => deixaReiSeguro(pos, mv));
  }

  // Todos os lances legais do lado que joga (ou de "cor").
  function todosLegais(pos, cor = pos.currentTurn) {
    const out = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = pos.board[r][c];
      if (p && p[0] === cor) for (const mv of legais(pos, r, c)) out.push(mv);
    }
    return out;
  }

  function temLanceLegal(pos, cor = pos.currentTurn) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = pos.board[r][c];
      if (p && p[0] === cor && legais(pos, r, c).length) return true;
    }
    return false;
  }

  // Ninguém consegue dar mate: K x K, K+B x K, K+N x K, K+B x K+B (bispos na mesma cor).
  function materialInsuficiente(b) {
    const resto = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (!p || p[1] === 'K') continue;
      if (p[1] === 'P' || p[1] === 'R' || p[1] === 'Q') return false;
      resto.push({ p, cor: (r + c) % 2 });
    }
    if (resto.length <= 1) return true;
    return resto.every(x => x.p[1] === 'B') && resto.every(x => x.cor === resto[0].cor);
  }

  // Chave da posição para detectar repetição (peças + vez + roques + en passant).
  function chave(pos) {
    let s = '';
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) s += pos.board[r][c] ? pos.board[r][c] : '.';
    const d = pos.castlingRights;
    return s + pos.currentTurn + (d.wK ? 'K' : '') + (d.wQ ? 'Q' : '') + (d.bK ? 'k' : '') + (d.bQ ? 'q' : '') +
      (pos.enPassantTarget ? nomeCasa(...pos.enPassantTarget) : '-');
  }

  // Situação para o lado que joga.
  // -> { fim:false, xeque } ou { fim:true, tipo, vencedor, texto }
  function situacao(pos, historico = []) {
    const cor = pos.currentTurn, xeque = emXeque(pos, cor);
    if (!temLanceLegal(pos, cor)) {
      if (xeque) return { fim: true, xeque, tipo: 'xequemate', vencedor: outraCor(cor), texto: `Xeque-mate! O ${NOME_REINO[outraCor(cor)]} venceu.` };
      return { fim: true, xeque, tipo: 'afogamento', vencedor: null, texto: 'Empate por afogamento: o rei não está em xeque, mas não há jogadas legais.' };
    }
    if (materialInsuficiente(pos.board)) return { fim: true, xeque, tipo: 'material', vencedor: null, texto: 'Empate: não há peças suficientes para dar xeque-mate.' };
    if (pos.halfmoveClock >= 100) return { fim: true, xeque, tipo: 'cinquenta', vencedor: null, texto: 'Empate pela regra dos 50 lances sem captura ou movimento de peão.' };
    const k = chave(pos);
    if (historico.filter(h => h === k).length >= 3) return { fim: true, xeque, tipo: 'repeticao', vencedor: null, texto: 'Empate por repetição: a mesma posição apareceu três vezes.' };
    return { fim: false, xeque };
  }

  return {
    CAVALO, REI, dentro, inicial, copiar, posRei, atacada, emXeque, pseudo, casaCapturada,
    aplicar, legais, todosLegais, temLanceLegal, materialInsuficiente, chave, situacao
  };
})();

/* ============================================================
   PECAS
   ============================================================ */
/* Peças 3D em SVG puro.
   Técnica: cada peça é um "torno" (pilha de seções troncocônicas) com sombreamento
   cilíndrico por gradientes horizontais, elipses de topo/base para o volume (vista 3/4),
   oclusão ambiente, faixa especular e rim light. Os gradientes ficam em UM <svg> oculto
   compartilhado (ids pc-*), então 32 peças na página não colidem nem pesam.
   Contrato: Pecas.svg(tipo, cor, opcoes?) -> string <svg viewBox="0 0 100 150">,
   base centrada em (50, 138). opcoes.simples = versão sem detalhes finos. */
const Pecas = (() => {
  const SIMBOLO = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟︎' };
  const CX = 50;
  const E = 0.26; // achatamento das elipses (inclinação da câmera)

  /* ---------- Materiais ---------- */
  // Cilindro: [posição, cor]; luz vem da esquerda, rim light à direita.
  const CILINDRO = {
    w: [[0, '#8f7c5a'], [.06, '#c4b391'], [.18, '#f1e7cf'], [.27, '#fffaf0'], [.33, '#ffffff'], [.39, '#f7efdc'],
        [.55, '#e9ddc3'], [.78, '#c9b995'], [.92, '#a28f6c'], [.972, '#d6c8a8'], [1, '#7d6b4a']],
    b: [[0, '#040303'], [.06, '#120e0d'], [.18, '#2b2523'], [.26, '#453c3b'], [.32, '#8a98b4'], [.37, '#3e3a3d'],
        [.55, '#1f1a19'], [.78, '#110d0c'], [.92, '#0a0808'], [.968, '#3f485a'], [1, '#040303']],
    g: [[0, '#5d3f0d'], [.08, '#a67a26'], [.22, '#efcf74'], [.31, '#fff4bd'], [.38, '#e6bb4c'], [.58, '#c4952f'],
        [.82, '#86601a'], [.95, '#dcb255'], [1, '#553a0a']],
    r: [[0, '#1c0204'], [.1, '#5a080d'], [.24, '#a11a24'], [.31, '#f0787a'], [.38, '#b02029'], [.6, '#760d14'],
        [.84, '#470609'], [.95, '#9a2a32'], [1, '#180203']]
  };
  // Topo (radial): [centro, borda]
  const TOPO = { w: ['#d6c7a5', '#fffaf0'], b: ['#0d0a09', '#4a4d58'], g: ['#a8791f', '#ffeaa5'], r: ['#400509', '#cc3a42'] };
  // Esfera: [brilho, luz, meio, sombra, escuro]
  const ESFERA = {
    w: ['#ffffff', '#fbf4e2', '#dccfb0', '#a99772', '#7e6c4b'],
    b: ['#8e9cb8', '#3c3638', '#161211', '#0a0807', '#030202'],
    g: ['#fffbd0', '#f2d47c', '#c4952f', '#8a621a', '#5a3d0b'],
    r: ['#ffb0ae', '#d4343c', '#8a1019', '#520409', '#240103']
  };
  const CONTORNO = { w: '#6a5836', b: '#000000', g: '#5a3d0b', r: '#1a0204' };
  const ESPECULAR = { w: 'rgba(255,255,255,.7)', b: 'rgba(176,196,238,.6)', g: 'rgba(255,250,215,.7)', r: 'rgba(255,190,190,.55)' };

  let defsFeito = false;
  function montarDefs() {
    const parar = l => l.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('');
    let d = '';
    for (const m of ['w', 'b', 'g', 'r']) {
      d += `<linearGradient id="pc-cil-${m}" x1="0" y1="0" x2="1" y2="0">${parar(CILINDRO[m])}</linearGradient>`;
      d += `<radialGradient id="pc-topo-${m}" cx=".42" cy=".4" r=".62"><stop offset="0" stop-color="${TOPO[m][0]}"/><stop offset="1" stop-color="${TOPO[m][1]}"/></radialGradient>`;
      const e = ESFERA[m];
      d += `<radialGradient id="pc-esf-${m}" cx=".37" cy=".3" r=".78" fx=".32" fy=".24"><stop offset="0" stop-color="${e[0]}"/><stop offset=".16" stop-color="${e[1]}"/><stop offset=".5" stop-color="${e[2]}"/><stop offset=".82" stop-color="${e[3]}"/><stop offset="1" stop-color="${e[4]}"/></radialGradient>`;
    }
    // Faixa vertical para braços da cruz (sombreamento no outro eixo)
    for (const m of ['g', 'r']) {
      d += `<linearGradient id="pc-cilv-${m}" x1="0" y1="0" x2="0" y2="1">${parar(CILINDRO[m])}</linearGradient>`;
    }
    d += '<linearGradient id="pc-ao" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".30"/><stop offset=".16" stop-color="#000" stop-opacity=".04"/><stop offset=".7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".34"/></linearGradient>';
    d += '<radialGradient id="pc-sombra" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".62"/><stop offset=".6" stop-color="#000" stop-opacity=".3"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>';
    d += '<radialGradient id="pc-brilho" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".5" stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>';
    d += '<radialGradient id="pc-buraco" cx=".5" cy=".35" r=".6"><stop offset="0" stop-color="#000" stop-opacity=".78"/><stop offset=".7" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient>';
    // Cavalo: sombreamento diagonal do corpo
    d += `<linearGradient id="pc-cav-w" x1="0" y1=".15" x2="1" y2=".7"><stop offset="0" stop-color="#bfae8a"/><stop offset=".07" stop-color="#e9dec3"/><stop offset=".2" stop-color="#fffaf0"/><stop offset=".3" stop-color="#fffdf8"/><stop offset=".48" stop-color="#e8dcc2"/><stop offset=".72" stop-color="#c7b693"/><stop offset=".92" stop-color="#9f8c69"/><stop offset="1" stop-color="#b8a883"/></linearGradient>`;
    d += `<linearGradient id="pc-cav-b" x1="0" y1=".15" x2="1" y2=".7"><stop offset="0" stop-color="#12100f"/><stop offset=".07" stop-color="#2a2423"/><stop offset=".2" stop-color="#4a4142"/><stop offset=".28" stop-color="#7c879e"/><stop offset=".36" stop-color="#3a3536"/><stop offset=".55" stop-color="#1c1716"/><stop offset=".78" stop-color="#0f0b0a"/><stop offset=".93" stop-color="#070505"/><stop offset="1" stop-color="#2c3340"/></linearGradient>`;
    for (const [m, cor, oa, ob] of [['w', '#6b4a1c', .34, .42], ['b', '#000', .42, .55]]) {
      d += `<linearGradient id="pc-cav-sombra-${m}" gradientUnits="userSpaceOnUse" x1="50" y1="0" x2="82" y2="0"><stop offset="0" stop-color="${cor}" stop-opacity="0"/><stop offset="1" stop-color="${cor}" stop-opacity="${oa}"/></linearGradient>`;
      d += `<linearGradient id="pc-cav-chao-${m}" gradientUnits="userSpaceOnUse" x1="0" y1="100" x2="0" y2="119"><stop offset="0" stop-color="${cor}" stop-opacity="0"/><stop offset="1" stop-color="${cor}" stop-opacity="${ob}"/></linearGradient>`;
    }
    d += '<clipPath id="pc-cav-clip"><path d="' + CAVALO_CONTORNO + '"/></clipPath>';
    return `<svg id="pc-defs" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false"><defs>${d}</defs></svg>`;
  }

  function garantirDefs() {
    if (defsFeito || document.getElementById('pc-defs')) { defsFeito = true; return; }
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', garantirDefs, { once: true });
      return;
    }
    document.body.insertAdjacentHTML('afterbegin', montarDefs());
    defsFeito = true;
  }

  /* ---------- Primitivas ---------- */
  const n = v => Math.round(v * 100) / 100;

  // Seção de torno: yb/rb = base (centro da elipse inferior), yt/rt = topo; bulge > 0 convexo, < 0 côncavo.
  function secao(yb, rb, yt, rt, bulge = 0, m = 'b', topo = true, simples = false) {
    const ym = (yb + yt) / 2;
    const mid = (rb + rt) / 2 + 2 * bulge;
    const d = `M${n(CX - rt)},${n(yt)}Q${n(CX - mid)},${n(ym)} ${n(CX - rb)},${n(yb)}A${n(rb)},${n(rb * E)} 0 0 0 ${n(CX + rb)},${n(yb)}Q${n(CX + mid)},${n(ym)} ${n(CX + rt)},${n(yt)}A${n(rt)},${n(rt * E)} 0 0 1 ${n(CX - rt)},${n(yt)}Z`;
    let s = `<path d="${d}" fill="url(#pc-cil-${m})" stroke="${CONTORNO[m]}" stroke-opacity=".55" stroke-width=".6" stroke-linejoin="round"/>`;
    s += `<path d="${d}" fill="url(#pc-ao)"/>`;
    if (!simples && (yb - yt) > 3.5) {
      const f = 0.44;
      s += `<path d="M${n(CX - rt * f)},${n(yt + 1.5)}Q${n(CX - mid * f)},${n(ym)} ${n(CX - rb * f)},${n(yb - 0.5)}" fill="none" stroke="${ESPECULAR[m]}" stroke-width="${rb > 12 ? 1.5 : 1.1}" stroke-linecap="round" opacity=".55"/>`;
    }
    if (topo) {
      s += `<ellipse cx="${CX}" cy="${n(yt)}" rx="${n(rt)}" ry="${n(rt * E)}" fill="url(#pc-topo-${m})" stroke="${ESPECULAR[m]}" stroke-width=".5" stroke-opacity=".6"/>`;
    }
    return s;
  }

  // Esfera com brilho especular e reflexo suave
  function esfera(cy, r, m = 'b', cx = CX, simples = false) {
    let s = `<circle cx="${cx}" cy="${n(cy)}" r="${r}" fill="url(#pc-esf-${m})" stroke="${CONTORNO[m]}" stroke-opacity=".45" stroke-width=".5"/>`;
    if (!simples) {
      s += `<ellipse cx="${n(cx - r * 0.34)}" cy="${n(cy - r * 0.4)}" rx="${n(r * 0.3)}" ry="${n(r * 0.2)}" transform="rotate(-30 ${n(cx - r * 0.34)} ${n(cy - r * 0.4)})" fill="url(#pc-brilho)"/>`;
      s += `<path d="M${n(cx - r * 0.78)},${n(cy + r * 0.25)}A${n(r * 0.82)},${n(r * 0.82)} 0 0 0 ${n(cx + r * 0.25)},${n(cy + r * 0.8)}" fill="none" stroke="${ESPECULAR[m]}" stroke-width="${n(Math.max(0.5, r * 0.07))}" opacity=".28" stroke-linecap="round"/>`;
    }
    return s;
  }

  // Merlão / ponta: cilindro curto com topo elíptico
  function bloco(px, py, w, h, m, topo = true) {
    const hw = w / 2;
    let s = `<path d="M${n(px - hw)},${n(py - h)}L${n(px - hw)},${n(py)}A${n(hw)},${n(hw * E)} 0 0 0 ${n(px + hw)},${n(py)}L${n(px + hw)},${n(py - h)}Z" fill="url(#pc-cil-${m})" stroke="${CONTORNO[m]}" stroke-opacity=".55" stroke-width=".5"/>`;
    s += `<path d="M${n(px - hw)},${n(py - h)}L${n(px - hw)},${n(py)}A${n(hw)},${n(hw * E)} 0 0 0 ${n(px + hw)},${n(py)}L${n(px + hw)},${n(py - h)}Z" fill="url(#pc-ao)"/>`;
    if (topo) s += `<ellipse cx="${n(px)}" cy="${n(py - h)}" rx="${n(hw)}" ry="${n(hw * E)}" fill="url(#pc-topo-${m})"/>`;
    return s;
  }

  // Pontas de coroa (dama): cone com bolinha dourada/vermelha na ponta
  function ponta(px, py, w, h, m, mp) {
    const hw = w / 2;
    const tw = Math.max(0.9, w * 0.12);
    let s = `<path d="M${n(px - hw)},${n(py)}L${n(px - tw)},${n(py - h)}L${n(px + tw)},${n(py - h)}L${n(px + hw)},${n(py)}A${n(hw)},${n(hw * E)} 0 0 1 ${n(px - hw)},${n(py)}Z" fill="url(#pc-cil-${m})" stroke="${CONTORNO[m]}" stroke-opacity=".55" stroke-width=".5"/>`;
    s += `<path d="M${n(px - hw)},${n(py)}L${n(px - tw)},${n(py - h)}L${n(px + tw)},${n(py - h)}L${n(px + hw)},${n(py)}Z" fill="url(#pc-ao)"/>`;
    s += esfera(py - h - 0.4, 2.7, mp, px, true);
    return s;
  }

  // Elementos dispostos em anel, do fundo para a frente: cb(px, py, frente(0..1), cosφ)
  function anel(y, raio, qtd, giro, cb) {
    const itens = [];
    for (let i = 0; i < qtd; i++) {
      const fi = giro + (i * 2 * Math.PI) / qtd;
      itens.push({ px: CX + raio * Math.sin(fi), py: y + raio * E * Math.cos(fi), c: Math.cos(fi) });
    }
    itens.sort((a, b) => a.c - b.c);
    return itens.map(it => cb(it.px, it.py, it.c)).join('');
  }

  /* ---------- Base comum ---------- */
  function base(R, m, mAcento, simples) {
    return secao(135, R, 128.5, R - 0.8, 0.8, m, true, simples) +
      secao(130.2, R - 3.2, 126.4, R - 3.8, 0.5, mAcento, true, simples) +
      secao(127.5, R - 6.5, 117, R - 14, -3.2, m, true, simples);
  }

  /* ---------- Peças ---------- */
  function peao(m, a, s) {
    return base(25, m, a, s) +
      secao(118, 11.5, 93, 7.2, -2.4, m, false, s) +
      secao(97, 8.4, 89, 13, -1.2, m, false, s) +
      secao(90.5, 13.6, 86.5, 13.6, 0.4, a, true, s) +
      secao(87.5, 7, 80, 6.4, 0, m, false, s) +
      esfera(70, 11.8, m, CX, s);
  }

  function torre(m, a, s) {
    let o = base(31, m, a, s) +
      secao(119, 19, 104, 15.2, -3.2, m, false, s) +
      secao(106.5, 17.4, 102.5, 17.4, 0.3, a, true, s) +
      secao(104, 15.4, 66, 14.6, -0.8, m, false, s) +
      secao(68, 15.4, 57, 21.5, -1.8, m, false, s) +
      secao(60.3, 22.2, 56.4, 22.2, 0.3, a, true, s) +
      secao(57, 21.6, 41, 21.6, 0, m, false, s);
    // coroa com ameias
    o += `<ellipse cx="${CX}" cy="41" rx="21.6" ry="${n(21.6 * E)}" fill="url(#pc-topo-${m})" stroke="${ESPECULAR[m]}" stroke-width=".5" stroke-opacity=".6"/>`;
    o += `<ellipse cx="${CX}" cy="41.8" rx="15.6" ry="${n(15.6 * E)}" fill="url(#pc-buraco)"/>`;
    o += anel(41.2, 18.6, 8, 0, (px, py, c) => bloco(px, py, 10 * (0.62 + 0.38 * Math.abs(c)) + 1.2, 10, m, true));
    return o;
  }

  function bispo(m, a, s) {
    let o = base(31, m, a, s) +
      secao(119, 18, 99, 10.4, -3.4, m, false, s) +
      secao(101, 16.2, 96.4, 16.2, 0.3, a, true, s) +
      secao(97.4, 15.2, 92, 14.4, 0.3, m, true, s) +
      secao(93, 9.2, 85, 8.6, 0, m, false, s) +
      secao(87, 9.8, 66, 19, 4.2, m, false, s) +
      secao(67, 19, 41, 5.4, 5, m, false, s);
    // fenda entalhada: sulco afinando nas pontas, lado escuro em cima e borda de luz paralela embaixo
    const sulco = (k, c) => `M39,64.2Q${n(50 - 0.4)},${n(56.4 - k)} 62.5,46.2Q${n(50.6)},${n(56.8 + c)} 39,64.2Z`;
    o += `<path d="${sulco(3.4, 3.6)}" fill="#000" fill-opacity=".85"/>`;
    o += `<path d="${sulco(1.2, 0.6)}" fill="#000" fill-opacity=".5" transform="translate(0 -.7)"/>`;
    if (!s) {
      o += `<path d="M40.5,66.4Q51,59.8 62,48.6Q51.6,59.2 40.5,66.4Z" fill="${ESPECULAR[m]}" opacity=".85"/>`;
      o += `<path d="M39.6,61.8Q50,53.4 61.6,44.4" fill="none" stroke="#000" stroke-opacity=".35" stroke-width=".7" stroke-linecap="round"/>`;
    }
    o += secao(43.2, 7.4, 39.6, 7.4, 0.2, a, true, s);
    o += esfera(35, 6.4, a, CX, s);
    return o;
  }

  function dama(m, a, s) {
    let o = base(33, m, a, s) +
      secao(119, 20, 98, 11.2, -3.8, m, false, s) +
      secao(100, 17.6, 95.4, 17.6, 0.3, a, true, s) +
      secao(96.6, 16.2, 91, 15.4, 0.3, m, true, s) +
      secao(92, 9.8, 70, 13.4, -1.4, m, false, s) +
      secao(72, 13.6, 52, 19.2, -2.2, m, false, s) +
      secao(54.5, 20.4, 50.4, 20.4, 0.3, a, true, s) +
      secao(51.2, 19.6, 37, 21, 0.8, m, false, s);
    // coroa de pontas
    o += `<ellipse cx="${CX}" cy="37" rx="21" ry="${n(21 * E)}" fill="url(#pc-topo-${m})" stroke="${ESPECULAR[m]}" stroke-width=".5" stroke-opacity=".6"/>`;
    o += `<ellipse cx="${CX}" cy="37.6" rx="16.2" ry="${n(16.2 * E)}" fill="url(#pc-buraco)"/>`;
    const pontas = (frente) => anel(37.2, 18.6, 9, 0.17, (px, py, c) => ((c >= 0) === frente ? ponta(px, py, 8.6, 16, m, a) : ''));
    o += pontas(false);
    o += secao(35, 5.6, 31.4, 5.8, 0, a, true, s);
    o += esfera(26.5, 6.2, a, CX, s);
    o += pontas(true);
    return o;
  }

  function rei(m, a, s) {
    const cv = a === 'g' ? 'g' : 'r';
    let o = base(34, m, a, s) +
      secao(119, 21, 97, 11.8, -4.2, m, false, s) +
      secao(99, 18.4, 94.4, 18.4, 0.3, a, true, s) +
      secao(95.6, 17, 89.4, 16, 0.3, m, true, s) +
      secao(90.4, 10.4, 68, 14.2, -1.6, m, false, s) +
      secao(70, 14.6, 50, 20, -2.2, m, false, s) +
      secao(52.6, 21.4, 48.2, 21.4, 0.3, a, true, s) +
      secao(49, 20.2, 38, 13.6, 2.6, m, false, s) +
      secao(40, 14.4, 36, 14.4, 0.3, a, true, s) +
      esfera(33.4, 5.4, a, CX, s);
    // cruz
    o += `<rect x="46.4" y="9" width="7.2" height="26" rx="1.6" fill="url(#pc-cil-${cv})" stroke="${CONTORNO[cv]}" stroke-opacity=".6" stroke-width=".5"/>`;
    o += `<rect x="38" y="15.2" width="24" height="7.2" rx="1.6" fill="url(#pc-cilv-${cv})" stroke="${CONTORNO[cv]}" stroke-opacity=".6" stroke-width=".5"/>`;
    o += `<rect x="46.4" y="15.2" width="7.2" height="7.2" fill="url(#pc-cil-${cv})"/>`;
    o += `<rect x="46.4" y="9" width="7.2" height="26" rx="1.6" fill="url(#pc-ao)" opacity=".5"/>`;
    o += `<ellipse cx="50" cy="9.2" rx="3.6" ry="1" fill="url(#pc-topo-${cv})"/>`;
    if (!s) {
      o += `<path d="M48.2,11 L48.2,33" stroke="${ESPECULAR[cv]}" stroke-width=".9" stroke-linecap="round" opacity=".7"/>`;
      o += `<path d="M40,17.2 L60,17.2" stroke="${ESPECULAR[cv]}" stroke-width=".8" stroke-linecap="round" opacity=".7"/>`;
      o += `<circle cx="50" cy="18.8" r="1.8" fill="url(#pc-esf-${m === 'w' ? 'r' : 'g'})" stroke="#000" stroke-opacity=".4" stroke-width=".3"/>`;
    }
    return o;
  }

  /* ---------- Cavalo ---------- */
  // Perfil voltado para a esquerda, pescoço longo e crina esculpida.
  var CAVALO_CONTORNO = 'M29,118C30,107 35,98 42,90C46,86 45,82 41,80C37,79.5 33,82 29,82C24,82 20,79 19.5,74C19,68.5 21.5,63.5 25.5,59.5C31,54 38,46 43.5,38C46,34.5 48.5,31 51.5,27.5L53,14Q56.5,19 60,26C69,29.5 76,46 77,68C77.5,88 75.5,104 75,118Z';

  function cavalo(m, a, s) {
    const cav = `url(#pc-cav-${m})`;
    const ac = a === 'g' ? '#e1b447' : '#b3202a';
    const acEsc = a === 'g' ? '#7a5513' : '#4e060b';
    const tom = m === 'w' ? '#7a5426' : '#000';
    const acClaro = a === 'g' ? '#fff0a8' : '#ff9a9a';
    let o = base(31, m, a, s) + secao(120, 25, 112.5, 23.5, 0.6, m, true, s);
    // crina atrás da cabeça (mechas esculpidas)
    const mechas = [
      'M59,23C68,18 80,26 84,40C80,38 76,38 74,40Z',
      'M66,36C76,34 87,44 88,58C83,55 79,55 76,57Z',
      'M70,52C80,52 90,62 89,76C85,72 80,72 77,74Z',
      'M73,70C82,72 91,82 88,96C85,92 80,91 77,93Z',
      'M74,88C82,92 89,102 85,114C82,110 79,109 76,110Z'
    ];
    mechas.forEach((d, i) => {
      o += `<path d="${d}" fill="url(#pc-cil-${m})" stroke="${CONTORNO[m]}" stroke-opacity=".6" stroke-width=".6" stroke-linejoin="round"/>`;
      o += `<path d="${d}" fill="url(#pc-ao)"/>`;
    });
    // cabeça e pescoço
    o += `<path d="${CAVALO_CONTORNO}" fill="${cav}" stroke="${CONTORNO[m]}" stroke-opacity=".6" stroke-width=".7" stroke-linejoin="round"/>`;
    o += '<g clip-path="url(#pc-cav-clip)">';
    o += `<rect x="0" y="0" width="100" height="150" fill="url(#pc-cav-sombra-${m})"/>`;
    o += `<rect x="0" y="0" width="100" height="150" fill="url(#pc-cav-chao-${m})"/>`;
    if (!s) {
      // maçã do rosto, mandíbula e garganta
      o += '<ellipse cx="46" cy="62" rx="9" ry="13" transform="rotate(-24 46 62)" fill="url(#pc-brilho)" opacity=".55"/>';
      o += `<path d="M31,82C38,78 45,76 51,69C54,78 52,88 46,92C44,86 38,83 31,82Z" fill="${tom}" opacity=".26"/>`;
      o += `<path d="M42,90C48,84 56,82 62,86C58,96 52,104 48,116L38,116C38,106 38,96 42,90Z" fill="${tom}" opacity=".2"/>`;
      o += '<path d="M27,62C34,54 40,47 47,37" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="2.4" stroke-linecap="round" opacity=".6"/>';
      o += '<path d="M23,76C24,72 25,69 25,66" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="1.6" stroke-linecap="round" opacity=".5"/>';
      // músculo do pescoço
      o += `<path d="M47,96C52,88 58,78 59,64" fill="none" stroke="${tom}" stroke-width="2" opacity=".2" stroke-linecap="round"/>`;
    }
    o += '</g>';
    // orelha
    o += `<path d="M54,26L53.6,16.5Q57,20.5 59.2,26Q56.5,27.4 54,26Z" fill="#000" opacity=".28"/>`;
    // topete
    o += `<path d="M52,24C56,22 61,27 60,34C58,31 56,30 53,31Z" fill="url(#pc-cil-${m})" stroke="${CONTORNO[m]}" stroke-opacity=".6" stroke-width=".5"/>`;
    // arreio
    o += `<path d="M24.6,64.5C29,68 32,73 32.6,79" fill="none" stroke="${acEsc}" stroke-width="3.6" stroke-linecap="round"/>`;
    o += `<path d="M24.6,64.5C29,68 32,73 32.6,79" fill="none" stroke="${ac}" stroke-width="2.4" stroke-linecap="round"/>`;
    o += `<path d="M24.4,63.7C28.4,67 31.4,71.6 32,77" fill="none" stroke="${acClaro}" stroke-width=".6" stroke-linecap="round" opacity=".8"/>`;
    o += `<path d="M37,70C42,62 47,52 50,36" fill="none" stroke="${acEsc}" stroke-width="3" stroke-linecap="round"/>`;
    o += `<path d="M37,70C42,62 47,52 50,36" fill="none" stroke="${ac}" stroke-width="1.9" stroke-linecap="round"/>`;
    o += `<circle cx="38.4" cy="69" r="2.1" fill="url(#pc-esf-${a})" stroke="#000" stroke-opacity=".4" stroke-width=".3"/>`;
    // olho, narina, boca
    o += '<ellipse cx="43.4" cy="51" rx="4.6" ry="3.2" transform="rotate(32 43.4 51)" fill="#000" opacity=".4"/>';
    o += `<ellipse cx="43.4" cy="51.2" rx="3.1" ry="2" transform="rotate(32 43.4 51.2)" fill="${m === 'w' ? '#2a170c' : '#8e1018'}"/>`;
    o += '<circle cx="42.4" cy="50.4" r=".75" fill="#fff" opacity=".95"/>';
    o += `<path d="M39.6,48.6Q44.4,45.4 48,49.6" fill="none" stroke="${m === 'w' ? '#8a7650' : '#6c7692'}" stroke-width=".9" stroke-linecap="round" opacity=".8"/>`;
    o += '<ellipse cx="22.6" cy="68.4" rx="1.6" ry="3" transform="rotate(-18 22.6 68.4)" fill="#000" opacity=".8"/>';
    o += '<path d="M20.6,76.4C25,78.8 31,78 36.6,74.4" fill="none" stroke="#000" stroke-width="1.15" stroke-linecap="round" opacity=".7"/>';
    // mechas sobre o pescoço (sulcos)
    if (!s) {
      const sulcos = ['M62,27C69,38 70,50 66,62', 'M66,44C73,56 73,70 69,82', 'M68,64C74,76 75,90 71,104'];
      sulcos.forEach(d => {
        o += `<path d="${d}" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="1.3" stroke-linecap="round"/>`;
        o += `<path d="${d}" fill="none" stroke="${ESPECULAR[m]}" stroke-width=".7" stroke-linecap="round" opacity=".55" transform="translate(-1.2 .4)"/>`;
      });
    }
    return o;
  }

  const DESENHO = { P: peao, R: torre, B: bispo, Q: dama, K: rei, N: cavalo };
  const ALTURA_SOMBRA = { K: 34, Q: 33, B: 31, N: 31, R: 31, P: 25 };

  /* ---------- API ---------- */
  function svg(tipo, cor, opcoes) {
    garantirDefs();
    const op = opcoes || {};
    const s = !!op.simples;
    const m = cor === 'b' ? 'b' : 'w';
    const a = m === 'w' ? 'g' : 'r';
    const f = DESENHO[tipo] || peao;
    const R = ALTURA_SOMBRA[tipo] || 30;
    const sombra = op.sombra === false ? '' :
      `<ellipse cx="50" cy="139" rx="${R + 8}" ry="${n((R + 8) * E)}" fill="url(#pc-sombra)"/>`;
    const nome = { K: 'rei', Q: 'dama', R: 'torre', B: 'bispo', N: 'cavalo', P: 'peao' }[tipo] || 'peao';
    return `<svg class="peca-svg peca-${nome} peca-${tipo} peca-${cor}${op.classe ? ' ' + op.classe : ''}" viewBox="0 0 100 150" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">${sombra}${f(m, a, s)}</svg>`;
  }

  return { svg, garantirDefs, SIMBOLO };
})();

/* ============================================================
   SONS
   ============================================================ */
/* ============================================================
   SONS: efeitos e música 100% sintetizados com a Web Audio API.
   Nenhum arquivo de áudio. Contrato:
   Sons.iniciar(), Sons.tocar(nome), Sons.musica('menu'|'batalha'|null),
   Sons.volume(0..1), Sons.mudo(bool).
   Cadeia: vozes -> barramentos (efeitos / música) -> compressor
           -> saturador suave (limitador) -> volume geral -> saída.
   Reverb de salão de pedra: convolução com resposta ao impulso gerada.
   ============================================================ */
const Sons = (() => {
  const LIMITE_VOZES = 230;     // fontes sonoras simultâneas (proteção de desempenho)
  const ANTECEDENCIA = 1.2;     // segundos de música agendados à frente
  const NIVEL_MUSICA = 0.13;    // música bem mais baixa que os efeitos

  let ctx = null, G = null;
  let volumeGeral = 0.6, silencio = false;
  let faixaPedida = null, faixa = null, temporizador = 0, ultimoPassar = 0;
  const caches = new WeakMap();

  /* ---------- Utilidades ---------- */
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const esc = lista => lista[Math.floor(Math.random() * lista.length)];
  const curvaVolume = v => Math.pow(Math.max(0, Math.min(1, v)), 1.6);

  /* ---------- Grafo principal (reaproveitado em testes offline) ---------- */
  function respostaImpulso(c) {
    // Ruído com decaimento exponencial e escurecimento progressivo: salão de pedra.
    const sr = c.sampleRate, len = Math.floor(sr * 2.6), b = c.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const x = i / len;
        const k = 0.85 * (1 - x) + 0.07;
        lp += ((Math.random() * 2 - 1) - lp) * k;
        const entrada = Math.min(1, i / (sr * 0.012));
        d[i] = lp * Math.pow(1 - x, 3.4) * entrada * (i < sr * 0.018 ? 0 : 1);
      }
    }
    return b;
  }

  function montar(c) {
    const g = { c, n: 0 };
    g.sfx = c.createGain(); g.sfx.gain.value = 0.8;
    g.mus = c.createGain(); g.mus.gain.value = NIVEL_MUSICA;
    g.rev = c.createConvolver(); g.rev.buffer = respostaImpulso(c);
    const retorno = c.createGain(); retorno.gain.value = 0.55;
    g.rev.connect(retorno);
    const soma = c.createGain();
    g.sfx.connect(soma); g.mus.connect(soma); retorno.connect(soma);
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 18; comp.ratio.value = 6;
    comp.attack.value = 0.004; comp.release.value = 0.22;
    // Saturador suave: nunca passa de 0,97, evitando clipping.
    const sat = c.createWaveShaper();
    const N = 2048, curva = new Float32Array(N);
    for (let i = 0; i < N; i++) { const x = (i / (N - 1)) * 2 - 1; curva[i] = 0.97 * Math.tanh(1.3 * x) / Math.tanh(1.3); }
    sat.curve = curva;
    g.master = c.createGain(); g.master.gain.value = 1;
    soma.connect(comp); comp.connect(sat); sat.connect(g.master); g.master.connect(c.destination);
    return g;
  }

  /* ---------- Primitivas de síntese ---------- */
  function bufferRuido(c) {
    let b = caches.get(c);
    if (!b) {
      b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      caches.set(c, b);
    }
    return b;
  }

  // Saída de uma voz: ganho próprio, com envio opcional ao reverb.
  function saida(g, dest, envio) {
    const o = g.c.createGain();
    o.connect(dest);
    if (envio > 0 && dest === g.sfx) { o._s = g.c.createGain(); o._s.gain.value = envio; o.connect(o._s); o._s.connect(g.rev); }
    return o;
  }
  // Conta a fonte e desconecta a voz quando a última terminar.
  function amarrar(g, fonte, o) {
    o._r = (o._r || 0) + 1; g.n++;
    fonte.onended = () => {
      g.n--;
      if (--o._r === 0) { try { o.disconnect(); if (o._s) o._s.disconnect(); } catch (e) { /* já solto */ } }
    };
  }
  // Envelope: ataque linear, queda exponencial (ou sustentação com repouso r).
  function env(par, t, a, vol, dur, r) {
    par.setValueAtTime(0.0001, t);
    par.linearRampToValueAtTime(vol, t + a);
    if (r) par.setValueAtTime(vol, t + Math.max(a, dur - r));
    par.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  // Oscilador com envelope, filtro passa-baixa, glissando e vibrato.
  function nota(g, p) {
    const c = g.c, t = p.t, dur = p.dur;
    const o = p.o || saida(g, p.dest || g.sfx, p.send || 0);
    const os = c.createOscillator();
    os.type = p.tipo || 'sine';
    os.frequency.setValueAtTime(p.f, t);
    if (p.f2) os.frequency.exponentialRampToValueAtTime(p.f2, t + (p.fd || dur));
    if (p.det) os.detune.value = p.det;
    let ult = os;
    if (p.lp) {
      const f = c.createBiquadFilter(); f.type = 'lowpass';
      const a = Array.isArray(p.lp) ? p.lp[0] : p.lp, b = Array.isArray(p.lp) ? p.lp[1] : p.lp;
      f.frequency.setValueAtTime(a, t);
      if (a !== b) f.frequency.exponentialRampToValueAtTime(b, t + (p.lpd || dur));
      f.Q.value = p.q || 0.7;
      os.connect(f); ult = f;
    }
    const gn = c.createGain();
    env(gn.gain, t, p.a === undefined ? 0.005 : p.a, p.vol === undefined ? 0.3 : p.vol, dur, p.r || 0);
    ult.connect(gn); gn.connect(o);
    os.start(t); os.stop(t + dur + 0.05); amarrar(g, os, o);
    if (p.vib) {
      const l = c.createOscillator(), lg = c.createGain();
      l.frequency.value = p.vib.f; lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(p.vib.c, t + (p.vib.atraso || 0.2) + 0.3);
      l.connect(lg); lg.connect(os.detune);
      l.start(t); l.stop(t + dur + 0.05); amarrar(g, l, o);
    }
    return o;
  }

  // Ruído filtrado com envelope.
  function ruido(g, p) {
    const c = g.c, t = p.t, dur = p.dur;
    const o = p.o || saida(g, p.dest || g.sfx, p.send || 0);
    const s = c.createBufferSource();
    s.buffer = bufferRuido(c); s.loop = true;
    const f = c.createBiquadFilter();
    f.type = p.tipo || 'bandpass';
    f.frequency.setValueAtTime(p.f || 1000, t);
    if (p.f2) f.frequency.exponentialRampToValueAtTime(p.f2, t + dur);
    f.Q.value = p.q || 1;
    const gn = c.createGain();
    env(gn.gain, t, p.a === undefined ? 0.002 : p.a, p.vol === undefined ? 0.2 : p.vol, dur, p.r || 0);
    s.connect(f); f.connect(gn); gn.connect(o);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05); amarrar(g, s, o);
    return o;
  }

  // Toque de madeira: corpo grave, estalo seco e harmônico oco.
  function toc(g, t, p) {
    const f = p.f || 200, v = p.vol === undefined ? 0.5 : p.vol, d = p.dur || 0.12;
    const o = saida(g, g.sfx, p.send === undefined ? 0.25 : p.send);
    nota(g, { o, t, f: f * 1.7, f2: f, fd: d * 0.5, dur: d, vol: v, a: 0.002 });
    nota(g, { o, t, tipo: 'triangle', f: f * 3.1, dur: d * 0.5, vol: v * 0.35, a: 0.001 });
    ruido(g, { o, t, dur: 0.03, vol: v * 0.7, f: p.brilho || 1600, q: 1.1 });
    return o;
  }

  // Sino/metal ressonante com razões inarmônicas.
  function sino(g, p) {
    const o = p.o || saida(g, p.dest || g.sfx, p.send === undefined ? 0.4 : p.send);
    const razoes = p.razoes || [0.5, 1, 2.76, 5.4, 8.93];
    const amps = p.amps || [0.45, 1, 0.55, 0.32, 0.16];
    const fatores = [1.25, 1, 0.6, 0.35, 0.2, 0.15, 0.1];
    razoes.forEach((r, i) => {
      const fr = p.f * r;
      if (fr > 15000) return;
      const dur = p.dur * (fatores[i] || 0.1);
      nota(g, { o, t: p.t, f: fr, dur, vol: p.vol * amps[i] * 0.5, a: 0.002 });
      if (i === 1) nota(g, { o, t: p.t, f: fr + 1.7, dur: dur * 0.9, vol: p.vol * 0.25, a: 0.002 }); // batimento
    });
    ruido(g, { o, t: p.t, dur: 0.05, vol: p.vol * 0.5, tipo: 'highpass', f: 3500 });
    return o;
  }

  // Tambor de guerra (tímpano / tom grave).
  function tambor(g, t, p) {
    const f = p.f || 85, v = p.vol === undefined ? 0.6 : p.vol, d = p.dur || 0.5;
    const o = saida(g, p.dest || g.sfx, p.send === undefined ? 0.35 : p.send);
    nota(g, { o, t, f: f * 2.1, f2: f, fd: 0.09, dur: d, vol: v, a: 0.003 });
    nota(g, { o, t, f: f * 1.5, f2: f * 0.75, fd: d, dur: d * 0.7, vol: v * 0.4, a: 0.003 });
    ruido(g, { o, t, dur: 0.07, vol: v * 0.6, tipo: 'lowpass', f: 700, q: 0.5 });
    ruido(g, { o, t, dur: 0.2, vol: v * 0.25, f: f * 2.5, q: 2 });
    return o;
  }

  // Metais (trompete/corneta): serras desafinadas + quadrada, filtro que abre.
  function metal(g, p) {
    const o = p.o || saida(g, p.dest || g.sfx, p.send === undefined ? 0.35 : p.send);
    const abre = p.abre || 6;
    [[-8, 'sawtooth', 1], [8, 'sawtooth', 1], [0, 'square', 0.45]].forEach(([det, tipo, k]) =>
      nota(g, { o, t: p.t, f: p.f, det, tipo, dur: p.dur, vol: p.vol * k * 0.4, a: p.a === undefined ? 0.035 : p.a,
        r: p.r === undefined ? 0.18 : p.r, lp: [p.f * 2, Math.min(p.f * abre, 9000)], lpd: 0.16, q: 1.3,
        vib: { f: 5.3, c: 7, atraso: 0.25 } }));
    return o;
  }

  // Cordas/órgão: serras desafinadas com passa-baixa.
  function pad(g, p) {
    const o = p.o || saida(g, p.dest || g.sfx, p.send === undefined ? 0.5 : p.send);
    [-10, 0, 10].forEach(det =>
      nota(g, { o, t: p.t, f: p.f, det, tipo: 'sawtooth', dur: p.dur, vol: p.vol * 0.4, a: p.a === undefined ? 0.4 : p.a,
        r: p.r === undefined ? p.dur * 0.5 : p.r, lp: p.lp || [500, 1100], lpd: p.dur * 0.8, vib: { f: 4.6, c: 5, atraso: 0.4 } }));
    return o;
  }

  // Cordas dedilhadas (harpa / alaúde).
  function dedilhado(g, p) {
    const o = p.o || saida(g, p.dest || g.sfx, p.send === undefined ? 0.45 : p.send);
    const f = p.f, dur = p.dur || 1.2, v = p.vol;
    nota(g, { o, t: p.t, tipo: 'triangle', f, dur, vol: v, a: 0.003, lp: [f * 7, f * 1.6], lpd: dur * 0.5 });
    nota(g, { o, t: p.t, f: f * 2, dur: dur * 0.55, vol: v * 0.35, a: 0.002 });
    nota(g, { o, t: p.t, f: f * 3.01, dur: dur * 0.25, vol: v * 0.12, a: 0.002 });
    ruido(g, { o, t: p.t, dur: 0.02, vol: v * 0.35, f: Math.min(f * 4, 6000), q: 1.5 });
    return o;
  }

  /* ---------- Efeitos: cada função agenda o som em t e devolve a duração ---------- */
  const FX = {
    clique(g, t) {
      toc(g, t, { f: 360, vol: 0.5, dur: 0.07, send: 0.12, brilho: 2400 });
      nota(g, { t, tipo: 'triangle', f: 2600, dur: 0.035, vol: 0.06 });
      return 0.2;
    },
    passar(g, t) {
      ruido(g, { t, dur: 0.035, vol: 0.05, f: 3200, q: 1.5 });
      nota(g, { t, f: 880, dur: 0.03, vol: 0.012 });
      return 0.1;
    },
    abrir(g, t) {
      const o = saida(g, g.sfx, 0.2);
      ruido(g, { o, t, dur: 0.32, a: 0.05, vol: 0.14, f: 1800, f2: 4200, q: 0.8 });
      for (let i = 0; i < 7; i++) ruido(g, { o, t: t + 0.02 + i * rnd(0.03, 0.05), dur: rnd(0.012, 0.03), vol: rnd(0.08, 0.18), tipo: 'highpass', f: rnd(2500, 5500) });
      nota(g, { o, t, f: 190, f2: 120, dur: 0.18, vol: 0.12, a: 0.03 });
      return 0.5;
    },
    transicao(g, t) {
      const o = saida(g, g.sfx, 0.45);
      ruido(g, { o, t, dur: 0.75, a: 0.28, vol: 0.38, f: 280, f2: 1700, q: 1.1 });
      ruido(g, { o, t: t + 0.25, dur: 0.5, a: 0.1, vol: 0.2, f: 1700, f2: 350, q: 1.3 });
      nota(g, { o, t, f: 70, f2: 48, dur: 0.7, vol: 0.18, a: 0.2 });
      return 0.85;
    },
    intro(g, t) {
      // tambores de guerra em crescendo + corneta distante
      [[0, 0.5, 80], [0.55, 0.55, 75], [1.1, 0.6, 85], [1.4, 0.55, 70], [1.65, 0.7, 80], [2.2, 0.8, 78], [2.5, 0.8, 70], [2.75, 1, 62]]
        .forEach(([dt, v, f]) => tambor(g, t + dt, { f, vol: v * 0.75, dur: 0.6, send: 0.5 }));
      const o = saida(g, g.sfx, 0.85);
      metal(g, { o, t: t + 1.15, f: mtof(50), dur: 1.0, vol: 0.2, a: 0.25, r: 0.4, abre: 3 });
      metal(g, { o, t: t + 1.95, f: mtof(57), dur: 1.35, vol: 0.22, a: 0.2, r: 0.7, abre: 3.5 });
      ruido(g, { t, dur: 3.2, a: 2.6, vol: 0.12, tipo: 'lowpass', f: 160, f2: 420, q: 0.7, send: 0.3 });
      return 3.4;
    },
    selecionar(g, t) {
      toc(g, t, { f: 520, vol: 0.32, dur: 0.07, send: 0.2, brilho: 2200 });
      nota(g, { t: t + 0.02, f: 700, f2: 980, dur: 0.07, vol: 0.05, a: 0.01 });
      return 0.2;
    },
    soltar(g, t) {
      toc(g, t, { f: 300, vol: 0.28, dur: 0.07, send: 0.15, brilho: 1200 });
      nota(g, { t, f: 620, f2: 420, dur: 0.08, vol: 0.04 });
      return 0.2;
    },
    invalido(g, t) {
      const o = saida(g, g.sfx, 0.08);
      nota(g, { o, t, f: 150, f2: 85, fd: 0.12, dur: 0.2, vol: 0.55, a: 0.003 });
      nota(g, { o, t, tipo: 'square', f: 105, dur: 0.12, vol: 0.12, lp: 260 });
      ruido(g, { o, t, dur: 0.06, vol: 0.3, tipo: 'lowpass', f: 450, q: 0.5 });
      return 0.3;
    },
    mover(g, t) {
      // peça de madeira pousando: corpo, estalo e eco de salão de pedra
      const o = saida(g, g.sfx, 0.5);
      nota(g, { o, t, f: 210, f2: 105, fd: 0.1, dur: 0.18, vol: 0.62, a: 0.002 });
      nota(g, { o, t, tipo: 'triangle', f: 640, f2: 520, dur: 0.07, vol: 0.2, a: 0.001 });
      nota(g, { o, t, f: 1180, dur: 0.04, vol: 0.06, a: 0.001 });
      ruido(g, { o, t, dur: 0.035, vol: 0.5, f: 1100, q: 1 });
      ruido(g, { o, t, dur: 0.1, vol: 0.18, tipo: 'lowpass', f: 380, q: 0.5 });
      return 0.5;
    },
    captura(g, t) {
      // choque de espadas: ruído agudo, metal inarmônico, golpe grave
      const o = saida(g, g.sfx, 0.45);
      ruido(g, { o, t, dur: 0.06, vol: 0.6, tipo: 'highpass', f: 3200 });
      ruido(g, { o, t, dur: 0.22, vol: 0.2, f: 5200, f2: 3000, q: 4 });
      sino(g, { o, t, f: 640, dur: 0.75, vol: 0.4, razoes: [1, 2.76, 5.4, 8.93, 11.3], amps: [1, 0.6, 0.4, 0.22, 0.12] });
      sino(g, { o, t: t + 0.075, f: 890, dur: 0.55, vol: 0.28, razoes: [1, 2.76, 5.4, 8.93], amps: [1, 0.55, 0.35, 0.2] });
      nota(g, { o, t, f: 140, f2: 55, fd: 0.14, dur: 0.28, vol: 0.55, a: 0.002 });
      ruido(g, { o, t: t + 0.14, dur: 0.07, vol: 0.12, tipo: 'highpass', f: 4500 });
      return 0.9;
    },
    roque(g, t) {
      // dois toques, correntes e ferrolho de portão
      toc(g, t, { f: 200, vol: 0.55, dur: 0.16, send: 0.4 });
      toc(g, t + 0.17, { f: 175, vol: 0.5, dur: 0.16, send: 0.4 });
      const o = saida(g, g.sfx, 0.4);
      for (let i = 0; i < 9; i++) ruido(g, { o, t: t + 0.42 + i * 0.028, dur: 0.02, vol: rnd(0.07, 0.15), f: rnd(3500, 6500), q: 4 });
      nota(g, { o, t: t + 0.4, tipo: 'sawtooth', f: 62, f2: 48, dur: 0.38, vol: 0.14, a: 0.06, lp: 220 });
      nota(g, { o, t: t + 0.78, tipo: 'square', f: 480, f2: 200, fd: 0.05, dur: 0.07, vol: 0.14, lp: 1800 });
      sino(g, { o, t: t + 0.78, f: 1050, dur: 0.3, vol: 0.14, razoes: [1, 2.76, 5.4], amps: [1, 0.5, 0.25] });
      nota(g, { o, t: t + 0.78, f: 120, f2: 60, fd: 0.1, dur: 0.25, vol: 0.5 });
      return 1.2;
    },
    promocao(g, t) {
      // arpejo de harpa e sino brilhante
      [67, 72, 76, 79, 84, 88].forEach((m, i) => dedilhado(g, { t: t + i * 0.075, f: mtof(m), dur: 1.3, vol: 0.28 - i * 0.015, send: 0.6 }));
      sino(g, { t: t + 0.5, f: mtof(96), dur: 1.4, vol: 0.2, razoes: [1, 2.76, 5.4], amps: [1, 0.4, 0.2], send: 0.7 });
      return 2.0;
    },
    xeque(g, t) {
      // sino de alarme duplo + curta corneta de alerta
      sino(g, { t, f: 392, dur: 1.3, vol: 0.5, send: 0.5 });
      sino(g, { t: t + 0.3, f: 392, dur: 1.5, vol: 0.45, send: 0.5 });
      const o = saida(g, g.sfx, 0.5);
      metal(g, { o, t: t + 0.05, f: mtof(57), dur: 0.22, vol: 0.2, a: 0.02, r: 0.08, abre: 5 });
      metal(g, { o, t: t + 0.3, f: mtof(57), dur: 0.5, vol: 0.2, a: 0.02, r: 0.25, abre: 5 });
      return 1.9;
    },
    xequemate(g, t) {
      // gongo grave, tímpano e acorde dramático em ré menor
      const o = saida(g, g.sfx, 0.65);
      sino(g, { o, t, f: 98, dur: 4.2, vol: 0.75, razoes: [1, 1.19, 1.56, 2.05, 2.43, 3.1, 4.2], amps: [1, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2] });
      ruido(g, { o, t, dur: 2.4, a: 0.35, vol: 0.14, f: 900, f2: 300, q: 0.7 });
      tambor(g, t, { f: 55, vol: 0.9, dur: 0.9, send: 0.6 });
      tambor(g, t + 0.9, { f: 55, vol: 0.6, dur: 0.8, send: 0.6 });
      [38, 45, 50, 53, 57, 62].forEach((m, i) => pad(g, { t: t + 0.15, f: mtof(m), dur: 3.8, vol: 0.2 - i * 0.012, a: 0.8, r: 2.2, lp: [380, 1400] }));
      metal(g, { t: t + 0.2, f: mtof(50), dur: 3.2, vol: 0.14, a: 0.7, r: 1.8, abre: 4, send: 0.6 });
      return 4.6;
    },
    vitoria(g, t) {
      // fanfarra de trompetes em dó maior
      const mel = [[0, 0.16, [67, 64]], [0.2, 0.16, [67, 64]], [0.4, 0.16, [67, 64]], [0.6, 0.55, [72, 67, 64]],
        [1.25, 0.18, [67, 64]], [1.46, 0.2, [72, 67]], [1.7, 0.45, [76, 72, 67]], [2.25, 1.2, [72, 76, 79, 84, 64]]];
      mel.forEach(([dt, d, ms], k) => ms.forEach((m, i) => metal(g, { t: t + dt, f: mtof(m), dur: d + 0.1, vol: (k === 7 ? 0.2 : 0.24) * (i ? 0.7 : 1), abre: 6, send: 0.45 })));
      [0, 0.2, 0.4, 0.6].forEach((dt, i) => tambor(g, t + dt, { f: 100, vol: 0.4 + i * 0.1, dur: 0.3 }));
      tambor(g, t + 2.25, { f: 70, vol: 0.9, dur: 0.9, send: 0.6 });
      ruido(g, { t: t + 2.25, dur: 1.3, a: 0.05, vol: 0.08, tipo: 'highpass', f: 6500, send: 0.4 });
      sino(g, { t: t + 2.3, f: mtof(84), dur: 1.4, vol: 0.14, razoes: [1, 2.76, 5.4], amps: [1, 0.4, 0.2], send: 0.7 });
      pad(g, { t: t + 2.2, f: mtof(48), dur: 1.5, vol: 0.18, a: 0.2, r: 0.9, lp: [500, 1800] });
      return 3.7;
    },
    derrota(g, t) {
      // tambor fúnebre e acordes menores descendentes
      [0, 0.85, 1.7, 2.55].forEach((dt, i) => tambor(g, t + dt, { f: 62, vol: 0.7 - i * 0.08, dur: 0.7, send: 0.6 }));
      const acordes = [[50, 53, 57], [48, 51, 55], [47, 50, 54]];
      acordes.forEach((ac, k) => ac.forEach(m => pad(g, { t: t + k * 1.05, f: mtof(m), dur: 1.7, vol: 0.18, a: 0.35, r: 1.0, lp: [320, 700] })));
      pad(g, { t: t + 2.1, f: mtof(35), dur: 2.0, vol: 0.2, a: 0.3, r: 1.2, lp: [260, 500] });
      sino(g, { t: t + 0.1, f: 130, dur: 2.8, vol: 0.28, send: 0.7 });
      return 4.2;
    },
    empate(g, t) {
      // acorde neutro em quintas abertas
      [48, 55, 62, 69].forEach((m, i) => {
        const o = saida(g, g.sfx, 0.6);
        nota(g, { o, t: t + i * 0.05, f: mtof(m), dur: 2.2, vol: 0.16, a: 0.4, r: 1.3 });
        nota(g, { o, t: t + i * 0.05, tipo: 'triangle', f: mtof(m) * 2.003, dur: 2.0, vol: 0.05, a: 0.5, r: 1.2 });
        nota(g, { o, t: t + i * 0.05, tipo: 'triangle', f: mtof(m) * 0.997, dur: 2.2, vol: 0.06, a: 0.4, r: 1.3, lp: 900 });
      });
      sino(g, { t: t + 0.3, f: mtof(79), dur: 1.4, vol: 0.12, razoes: [1, 2.76, 5.4], amps: [1, 0.4, 0.2], send: 0.7 });
      return 2.6;
    },
    reiniciar(g, t) {
      const o = saida(g, g.sfx, 0.35);
      ruido(g, { o, t, dur: 0.38, a: 0.18, vol: 0.28, f: 300, f2: 4200, q: 1 });
      ruido(g, { o, t: t + 0.3, dur: 0.3, a: 0.02, vol: 0.2, f: 3800, f2: 400, q: 1.2 });
      toc(g, t + 0.52, { f: 260, vol: 0.4, dur: 0.1, send: 0.3 });
      nota(g, { o, t: t + 0.54, f: 1040, dur: 0.25, vol: 0.06 });
      return 0.9;
    },
    segredo(g, t) {
      // brilho mágico: escala pentatônica cintilante e brilhos aleatórios
      const pent = [0, 2, 4, 7, 9];
      for (let i = 0; i < 9; i++) {
        const m = 84 + pent[i % 5] + 12 * Math.floor(i / 5) - (i > 6 ? 12 : 0);
        const tt = t + i * 0.065;
        const o = saida(g, g.sfx, 0.8);
        nota(g, { o, t: tt, f: mtof(m), dur: 0.9, vol: 0.13, a: 0.004 });
        nota(g, { o, t: tt, f: mtof(m) * 2.005, dur: 0.4, vol: 0.04, a: 0.004 });
      }
      for (let i = 0; i < 7; i++) nota(g, { t: t + rnd(0.1, 0.9), f: rnd(3000, 6500), dur: rnd(0.12, 0.3), vol: 0.035, send: 0.8 });
      nota(g, { t, f: 220, f2: 880, dur: 0.6, vol: 0.05, a: 0.2, send: 0.6 });
      return 1.9;
    }
  };

  /* ---------- Música procedural ---------- */
  // Bordão de gaita/hurdy-gurdy: serras desafinadas e fundo grave.
  function bordao(g, dest, t, dur, midis, vol, lpMax) {
    midis.forEach(m => {
      const f = mtof(m), o = saida(g, dest, 0);
      [-7, 7].forEach(det => nota(g, { o, t, f, det, tipo: 'sawtooth', dur, vol: vol * 0.45, a: 1.5, r: 1.5, lp: [lpMax * 0.7, lpMax], lpd: dur, q: 1.8 }));
      nota(g, { o, t, tipo: 'square', f: f * 2.002, dur, vol: vol * 0.07, a: 1.8, r: 1.5, lp: lpMax });
      nota(g, { o, t, f: f * 0.5, dur, vol: vol * 0.4, a: 1.5, r: 1.5 });
    });
  }

  const MENU = {
    nome: 'menu',
    // acordes (do dórico) e transições possíveis
    acordes: { Dm: [50, 53, 57], C: [48, 52, 55], G: [43, 47, 50], Am: [45, 48, 52] },
    prox: { Dm: ['Dm', 'C', 'G', 'Am'], C: ['Dm', 'G', 'Am'], G: ['Dm', 'C', 'Am'], Am: ['Dm', 'G', 'C'] },
    escala: [0, 2, 3, 5, 7, 9, 10],
    compasso(g, tg, e, t) {
      const dur = 4;
      if (e.i % 2 === 0) bordao(g, tg, t, 8 + 1.5, [38, 45], 0.26, 650);
      const ac = this.acordes[e.ac];
      // alaúde dedilhado
      const pad = esc([[0, 2, 1, 2, 0, 2, 1, 2], [0, 1, 2, 1, 2, 1, 0, 1], [0, 2, 1, 2, 1, 2, 1, 2]]);
      pad.forEach((k, s) => {
        if (Math.random() < 0.14) return;
        const m = ac[k] + (k === 0 ? 0 : 12) + (s % 4 === 3 ? 12 : 0);
        dedilhado(g, { dest: tg, t: t + s * 0.5 + rnd(-0.012, 0.012), f: mtof(m), dur: 1.5, vol: (s % 4 === 0 ? 0.2 : 0.13) * rnd(0.8, 1.1), send: 0.3 });
      });
      // flauta doce: frases de caminhada pela escala dórica
      if (Math.random() < 0.68) {
        const ritmo = esc([[4, 2, 2], [2, 2, 4], [3, 1, 4], [2, 2, 2, 2], [8], [1, 1, 2, 4], [6, 2], [2, 6]]);
        let s = esc([0, 0, 1]) === 0 ? 0 : 2;
        ritmo.forEach(n => {
          if (s >= 8) return;
          if (Math.random() < 0.18) { s += n; return; }
          e.d = Math.max(4, Math.min(12, e.d + esc([-2, -1, -1, 0, 1, 1, 2, 3])));
          const m = 62 + 12 * Math.floor(e.d / 7) + this.escala[e.d % 7];
          const f = mtof(m), d = n * 0.5 * 0.96 + 0.15, o = saida(g, tg, 0);
          nota(g, { o, t: t + s * 0.5, f, dur: d, vol: 0.16, a: 0.07, r: 0.25, vib: { f: 5, c: 11, atraso: 0.3 } });
          nota(g, { o, t: t + s * 0.5, f: f * 2.003, dur: d, vol: 0.025, a: 0.09, r: 0.25 });
          ruido(g, { o, t: t + s * 0.5, dur: d, a: 0.06, vol: 0.022, r: 0.2, f: f * 2, q: 3 });
          s += n;
        });
      }
      e.i++;
      e.ac = esc(this.prox[e.ac]);
      return dur;
    },
    novo() { return { i: 0, ac: 'Dm', d: 7 }; }
  };

  const BATALHA = {
    nome: 'batalha',
    passo: 0.36,
    motivos: [[0, 1, 0, -2], [0, 1, 3, 1, 0], [7, 8, 7, 5, 3], [0, 0, 1, 0, -2, 0], [3, 1, 0, 1], [12, 13, 12, 8]],
    padroes: [[1, 0, 0, 0.45, 0.8, 0, 0.45, 0.3], [1, 0, 0.35, 0, 0.8, 0, 0.5, 0.5], [1, 0, 0, 0.5, 0.85, 0, 0.35, 0]],
    compasso(g, tg, e, t) {
      const p = this.passo, dur = p * 8;
      if (e.i % 2 === 0) {
        bordao(g, tg, t, dur * 2 + 1.5, [28, 35], 0.34, 240);
        if (Math.random() < 0.12) metal(g, { dest: tg, t: t + 0.5, f: mtof(29), dur: dur * 1.6, vol: 0.08, a: 1.6, r: 1.2, abre: 2.5, send: 0.5 });
      }
      // tabor (tambor de moldura) grave e marcial
      const pad = e.i % 4 === 3 ? esc(this.padroes).map((v, s) => s >= 6 ? 0 : v) : esc(this.padroes);
      pad.forEach((v, s) => { if (v) tambor(g, t + s * p + rnd(-0.008, 0.008), { dest: tg, f: v > 0.7 ? 78 : 92, vol: 0.42 * v * rnd(0.85, 1.1), dur: 0.28, send: 0.45 }); });
      if (e.i % 4 === 3) for (let k = 0; k < 8; k++) tambor(g, t + 6 * p + k * p * 0.25, { dest: tg, f: 96, vol: 0.12 + k * 0.045, dur: 0.15, send: 0.4 });
      // motivos frígios esparsos
      if (Math.random() < (e.i % 4 === 2 ? 0.8 : 0.3)) {
        const mo = esc(this.motivos);
        const ini = esc([0, 2]);
        mo.forEach((off, k) => {
          const tt = t + (ini + k * 1.5) * p;
          if (tt - t > dur - 0.2) return;
          const f = mtof(52 + off), o = saida(g, tg, 0.5), d = p * 1.7;
          [-8, 8].forEach(det => nota(g, { o, t: tt, f, det, tipo: 'sawtooth', dur: d, vol: 0.12, a: 0.05, r: 0.3, lp: [f * 2, f * 4], lpd: d, vib: { f: 5, c: 9, atraso: 0.15 } }));
        });
      }
      e.i++;
      return dur;
    },
    novo() { return { i: 0 }; }
  };
  const FAIXAS = { menu: MENU, batalha: BATALHA };

  function criarFaixa(g, nome, destino) {
    const def = FAIXAS[nome];
    const tg = g.c.createGain();
    tg.connect(destino);
    const env2 = g.c.createGain(); env2.gain.value = 0.5; // envio ao reverb
    tg.connect(env2); env2.connect(g.rev);
    return { nome, def, tg, env2, e: def.novo(), prox: g.c.currentTime + 0.1 };
  }
  function agendar(g, fx, ate) {
    while (fx.prox < ate) fx.prox += fx.def.compasso(g, fx.tg, fx.e, fx.prox);
  }

  function pulso() {
    temporizador = 0;
    if (!ctx || !faixa || silencio) return;
    try { agendar(G, faixa, ctx.currentTime + ANTECEDENCIA); } catch (err) { /* não derruba o jogo */ }
    temporizador = setTimeout(pulso, 220);
  }

  function pararFaixa(fx, rapido) {
    if (!fx) return;
    const t = ctx.currentTime, dur = rapido ? 0.05 : 1.5;
    fx.tg.gain.cancelScheduledValues(t);
    fx.tg.gain.setValueAtTime(fx.tg.gain.value, t);
    fx.tg.gain.linearRampToValueAtTime(0, t + dur);
    setTimeout(() => { try { fx.tg.disconnect(); fx.env2.disconnect(); } catch (err) { /* já solto */ } }, dur * 1000 + 200);
  }

  function iniciarFaixa(nome) {
    if (!ctx || silencio) return;
    if (faixa && faixa.nome === nome) return;
    const antiga = faixa;
    faixa = null;
    pararFaixa(antiga);
    if (!nome) { clearTimeout(temporizador); temporizador = 0; return; }
    faixa = criarFaixa(G, nome, G.mus);
    const t = ctx.currentTime;
    faixa.tg.gain.setValueAtTime(0.0001, t);
    faixa.tg.gain.linearRampToValueAtTime(1, t + 1.5);
    if (!temporizador) pulso();
  }

  /* ---------- Interface pública ---------- */
  function aplicarVolume() {
    if (!G) return;
    G.master.gain.setTargetAtTime(silencio ? 0 : curvaVolume(volumeGeral), ctx.currentTime, 0.04);
  }

  return {
    iniciar() {
      try {
        if (!ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          ctx = new AC({ latencyHint: 'interactive' });
          G = montar(ctx);
          document.addEventListener('visibilitychange', () => {
            if (!ctx) return;
            if (document.hidden) ctx.suspend(); else ctx.resume();
          });
        }
        aplicarVolume();
        if (ctx.state === 'suspended') ctx.resume();
        if (faixaPedida && !silencio) iniciarFaixa(faixaPedida);
      } catch (err) { /* sem áudio disponível */ }
    },
    tocar(nome) {
      try {
        const fx = FX[nome];
        if (!fx || !ctx || silencio) return;
        if (ctx.state === 'suspended') ctx.resume();
        const agora = performance.now();
        if (nome === 'passar') {
          if (agora - ultimoPassar < 80 || G.n > 60) return;
          ultimoPassar = agora;
        }
        if (G.n > LIMITE_VOZES) return;
        fx(G, ctx.currentTime + 0.01);
      } catch (err) { /* som nunca pode quebrar o jogo */ }
    },
    musica(nome) {
      faixaPedida = nome === 'menu' || nome === 'batalha' ? nome : null;
      try {
        if (!ctx) return;
        if (silencio) return;
        iniciarFaixa(faixaPedida);
      } catch (err) { /* ignora */ }
    },
    volume(v) {
      volumeGeral = Math.max(0, Math.min(1, +v || 0));
      const faixaVol = document.getElementById('audio-volume');
      if (faixaVol) faixaVol.style.setProperty('--p', Math.round(volumeGeral * 100) + '%');
      try { aplicarVolume(); } catch (err) { /* ignora */ }
    },
    mudo(b) {
      const novo = !!b;
      if (novo === silencio) return;
      silencio = novo;
      try {
        if (ctx) {
          aplicarVolume();
          if (silencio) {
            const f = faixa; faixa = null;
            if (f) pararFaixa(f, true);
            clearTimeout(temporizador); temporizador = 0;
          } else if (faixaPedida) iniciarFaixa(faixaPedida);
        }
      } catch (err) { /* ignora */ }
    },
    // ---- Ganchos de teste (renderização offline) ----
    _efeitos: Object.keys(FX),
    _render(nome, c) { const g = montar(c); return FX[nome](g, 0.02); },
    _renderMusica(nome, c, dur) {
      const g = montar(c), fx = criarFaixa(g, nome, g.mus);
      fx.prox = 0.02; agendar(g, fx, dur);
      return dur;
    }
  };
})();

/* ============================================================
   TABULEIRO
   ============================================================ */
/* Tabuleiro 3D em CSS: casas, peças em pé (billboard), destaques, acessibilidade,
   animação de lances (levantar, voar em arco, pousar, capturar) e vista 2D/3D.
     Tabuleiro.montar(aoClicar)   cria as 64 casas UMA vez em #tabuleiro
     Tabuleiro.desenhar(S)        sincroniza peças e destaques com o estado
     Tabuleiro.animarLance(S, mv) -> Promise   roda ANTES de o estado mudar
     Tabuleiro.marcarFim(...) / Tabuleiro.raio(...) / Tabuleiro.limparFim()   usados pelo Ambiente */
const Tabuleiro = (() => {
  let raiz, mesa, cena, area, camadaVoo, camadaFx, dica, botaoVista;
  let aoClicarFn = () => {};
  const casas = [];
  let foco = [6, 4];
  let vista = '3d';
  let timerDica = 0;
  let animando = false;
  let invertido = false;  // true: Reino Negro embaixo (jogador local de pretas no Multiplayer)
  const cachePecas = {};
  // casa lógica (r, c) -> posição na tela; com o tabuleiro invertido, a8 fica embaixo à direita
  const vis = (r, c) => (invertido ? [7 - r, 7 - c] : [r, c]);

  /* ---------- utilidades ---------- */
  const limitar = (v, a, b) => Math.max(a, Math.min(b, v));
  const suave = t => { t = limitar(t, 0, 1); return t * t * (3 - 2 * t); };
  const aleatorio = (a, b) => a + Math.random() * (b - a);
  function gerador(semente) {
    return () => {
      semente = (semente + 0x6D2B79F5) | 0;
      let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const uri = svg => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  const lerArmazenado = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const gravarArmazenado = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } };

  /* ---------- textura das casas: pedra creme com rachaduras e carvão com salpicos dourados ---------- */
  function texturaCampo() {
    const rnd = gerador(20240607);
    const n = v => v.toFixed(1);
    let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" preserveAspectRatio="none">';
    s += `<defs>
      <linearGradient id="gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f8edd2"/><stop offset=".55" stop-color="#ecdcb4"/><stop offset="1" stop-color="#dcc592"/></linearGradient>
      <linearGradient id="gd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#37322d"/><stop offset="1" stop-color="#171412"/></linearGradient>
      <linearGradient id="sc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
      <linearGradient id="sh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
    </defs>`;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      const x = j * 100, y = i * 100, clara = (i + j) % 2 === 0;
      if (clara) {
        s += `<rect x="${x}" y="${y}" width="100" height="100" fill="url(#gl)"/>`;
        s += `<rect x="${x}" y="${y}" width="100" height="100" fill="rgba(${150 + rnd() * 40 | 0},${110 + rnd() * 30 | 0},60,${n(rnd() * .1)})"/>`;
        for (let k = 0; k < 3; k++) s += `<ellipse cx="${n(x + rnd() * 100)}" cy="${n(y + rnd() * 100)}" rx="${n(8 + rnd() * 20)}" ry="${n(6 + rnd() * 14)}" fill="#b89458" opacity="${n(.05 + rnd() * .1)}"/>`;
        // rachaduras: caminhada aleatória com ramificação
        const rachar = (px, py, ang, passos, esp) => {
          let d = `M${n(px)} ${n(py)}`;
          for (let p = 0; p < passos; p++) {
            ang += (rnd() - .5) * 1.1;
            px += Math.cos(ang) * (6 + rnd() * 9); py += Math.sin(ang) * (6 + rnd() * 9);
            d += `L${n(limitar(px, x + 1, x + 99))} ${n(limitar(py, y + 1, y + 99))}`;
            if (rnd() < .18 && passos > 3 && esp > .5) rachar(px, py, ang + (rnd() - .5) * 2, 3, esp * .7);
          }
          s += `<path d="${d}" fill="none" stroke="#fff8e4" stroke-width="${n(esp)}" opacity=".5" transform="translate(.9 .9)"/><path d="${d}" fill="none" stroke="#8d6f3f" stroke-width="${n(esp)}" opacity=".6" stroke-linejoin="round"/>`;
        };
        const nr = 1 + (rnd() * 2.3 | 0);
        for (let k = 0; k < nr; k++) rachar(x + rnd() * 100, y + rnd() * 100, rnd() * 6.28, 4 + (rnd() * 4 | 0), 1);
      } else {
        s += `<rect x="${x}" y="${y}" width="100" height="100" fill="url(#gd)"/>`;
        for (let k = 0; k < 6; k++) s += `<ellipse cx="${n(x + rnd() * 100)}" cy="${n(y + rnd() * 100)}" rx="${n(6 + rnd() * 20)}" ry="${n(5 + rnd() * 14)}" fill="${rnd() < .8 ? '#5a5047' : '#3b1f1b'}" opacity="${n(.1 + rnd() * .2)}"/>`;
        // salpicos dourados agrupados
        for (let g = 0; g < 3; g++) {
          const gx = x + 12 + rnd() * 76, gy = y + 12 + rnd() * 76, qt = 8 + (rnd() * 10 | 0);
          for (let k = 0; k < qt; k++) {
            const px = gx + (rnd() + rnd() - 1) * 24, py = gy + (rnd() + rnd() - 1) * 24;
            s += `<circle cx="${n(limitar(px, x + 2, x + 98))}" cy="${n(limitar(py, y + 2, y + 98))}" r="${n(.5 + rnd() * 1.9)}" fill="${rnd() < .75 ? '#d6ad54' : '#f3d98b'}" opacity="${n(.3 + rnd() * .6)}"/>`;
          }
        }
      }
      // chanfro: luz no topo/esquerda, sombra embaixo/direita
      s += `<path d="M${x + 1} ${y + 99}V${y + 1}H${x + 99}" fill="none" stroke="rgba(255,255,255,${clara ? .5 : .13})" stroke-width="2"/>`;
      s += `<path d="M${x + 99} ${y + 1}V${y + 99}H${x + 1}" fill="none" stroke="rgba(0,0,0,${clara ? .22 : .5})" stroke-width="2"/>`;
      s += `<rect x="${x + .6}" y="${y + .6}" width="98.8" height="98.8" fill="none" stroke="rgba(30,18,8,.55)" stroke-width="1.2"/>`;
    }
    // sombra interna nas bordas do campo (efeito de encaixe)
    s += '<rect x="0" y="0" width="800" height="26" fill="url(#sc)"/><rect x="0" y="0" width="22" height="800" fill="url(#sh)"/>';
    s += '<rect x="0" y="0" width="800" height="800" fill="none" stroke="#2b1a0d" stroke-width="5"/></svg>';
    return uri(s);
  }

  /* ---------- moldura em SVG: faixas vermelhas, dentes de serra, vinhas, coroas e coordenadas ---------- */
  function molduraSVG() {
    const F = 140, T = 1080;
    // um lado (o de cima); os outros são rotações do mesmo desenho
    let d = '';
    for (let x = F; x < T - F; x += 20) d += `M${x} 34L${x + 10} 13L${x + 20} 34Z`;
    let borda = `<path d="${d}" fill="#a82d24"/><rect x="${F}" y="34" width="${T - 2 * F}" height="4" fill="#a82d24"/><rect x="${F}" y="9" width="${T - 2 * F}" height="3" fill="#a82d24"/>`;
    const onda = x => 66 + 9 * Math.sin((x - F) / 800 * Math.PI * 8);
    const pts = [];
    for (let x = F; x <= T - F; x += 6) pts.push(`${x} ${onda(x).toFixed(1)}`);
    borda += `<polyline points="${pts.join(' ')}" fill="none" stroke="#3f5a22" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
    borda += `<polyline points="${pts.join(' ')}" fill="none" stroke="#5a7a30" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>`;
    for (let m = 0; m < 8; m++) {
      const xc = F + 50 + m * 100, yc = onda(xc), dir = m % 2 ? -1 : 1;
      // par de folhas no cruzamento da vinha
      for (const a of [-1, 1]) {
        const ang = dir * a * 40, cx = xc + Math.cos(ang * Math.PI / 180) * 13, cy = yc + Math.sin(ang * Math.PI / 180) * 13 * (a);
        borda += `<ellipse cx="${cx.toFixed(1)}" cy="${(yc + a * 11).toFixed(1)}" rx="15" ry="5.4" transform="rotate(${a * -34 * dir} ${cx.toFixed(1)} ${(yc + a * 11).toFixed(1)})" fill="#5d7d33" stroke="#33481a" stroke-width="1.2"/>`;
      }
    }
    for (let m = 0; m < 8; m++) {
      const xf = F + 25 + m * 100, cima = m % 2 === 0, yv = onda(xf);
      const yf = cima ? yv - 15 : yv + 15;
      borda += `<path d="M${xf} ${yv}L${xf} ${yf}" stroke="#3f5a22" stroke-width="2.4"/><circle cx="${xf}" cy="${yf}" r="9" fill="#c23a2a" stroke="#6e1414" stroke-width="2"/><circle cx="${xf - 2.5}" cy="${yf - 2.5}" r="3.2" fill="#f07b5a"/>`;
    }
    borda += `<rect x="${F}" y="96" width="${T - 2 * F}" height="3" fill="#a82d24"/>`;

    const coroa = `<path d="M30 92L24 44L48 64L62 36L76 64L100 44L94 92Z" fill="url(#ouro)" stroke="#4d3009" stroke-width="2.6" stroke-linejoin="round"/>
      <rect x="28" y="92" width="68" height="12" rx="2" fill="url(#ouro)" stroke="#4d3009" stroke-width="2.6"/>
      <path d="M40 98H84" stroke="#fff3c0" stroke-width="2" opacity=".8"/>
      <circle cx="24" cy="42" r="5" fill="#f3d98b" stroke="#4d3009" stroke-width="2"/><circle cx="62" cy="33" r="5" fill="#f3d98b" stroke="#4d3009" stroke-width="2"/><circle cx="100" cy="42" r="5" fill="#f3d98b" stroke="#4d3009" stroke-width="2"/>`;
    const canto = `<rect x="0" y="0" width="${F}" height="${F}" fill="url(#verm)"/><rect x="9" y="9" width="${F - 18}" height="${F - 18}" fill="none" stroke="#f3e3b8" stroke-width="3"/>${coroa}`;

    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${T} ${T}" class="moldura-svg" focusable="false">
      <defs>
        <radialGradient id="pg" cx=".5" cy=".5" r=".75"><stop offset="0" stop-color="#f6ead0"/><stop offset=".7" stop-color="#ecdcb0"/><stop offset="1" stop-color="#c9ae78"/></radialGradient>
        <linearGradient id="ouro" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fdeeb0"/><stop offset=".5" stop-color="#e2bc5a"/><stop offset="1" stop-color="#9a742a"/></linearGradient>
        <linearGradient id="verm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c8432f"/><stop offset="1" stop-color="#85201a"/></linearGradient>
        <g id="borda">${borda}</g><g id="canto">${canto}</g>
      </defs>
      <rect width="${T}" height="${T}" fill="url(#pg)"/>
      <rect x="4" y="4" width="${T - 8}" height="${T - 8}" fill="none" stroke="#2b1a0d" stroke-width="5"/>
      <use href="#borda"/>
      <use href="#borda" transform="rotate(180 ${T / 2} ${T / 2})"/>
      <use href="#borda" transform="rotate(-90 ${T / 2} ${T / 2})"/>
      <use href="#borda" transform="rotate(90 ${T / 2} ${T / 2})"/>
      <use href="#canto"/><use href="#canto" transform="translate(${T - F} 0)"/><use href="#canto" transform="translate(0 ${T - F})"/><use href="#canto" transform="translate(${T - F} ${T - F})"/>
      <rect x="${F - 5}" y="${F - 5}" width="${T - 2 * F + 10}" height="${T - 2 * F + 10}" fill="none" stroke="#2b1a0d" stroke-width="3.5"/>
      <rect x="${F - 10}" y="${F - 10}" width="${T - 2 * F + 20}" height="${T - 2 * F + 20}" fill="none" stroke="#a82d24" stroke-width="3"/>
      <rect x="${F - 15}" y="${F - 15}" width="${T - 2 * F + 30}" height="${T - 2 * F + 30}" fill="none" stroke="#b8923f" stroke-width="2"/>`;
    // coordenadas a–h e 1–8 nas quatro faixas internas
    const tx = 'font-family="Pirata One,UnifrakturMaguntia,serif" font-size="27" text-anchor="middle" dominant-baseline="central" fill="#4a120d" stroke="#fff3cf" stroke-width="1.2" paint-order="stroke"';
    for (let i = 0; i < 8; i++) {
      const p = F + 50 + i * 100;
      const col = COLUNAS[invertido ? 7 - i : i], fil = invertido ? i + 1 : 8 - i;
      s += `<text x="${p}" y="${F - 29}" ${tx}>${col}</text><text x="${p}" y="${T - F + 29}" ${tx}>${col}</text>`;
      s += `<text x="${F - 29}" y="${p}" ${tx}>${fil}</text><text x="${T - F + 29}" y="${p}" ${tx}>${fil}</text>`;
    }
    // manchas leves de pergaminho
    const rnd = gerador(77);
    for (let i = 0; i < 26; i++) s += `<ellipse cx="${(rnd() * T) | 0}" cy="${(rnd() * T) | 0}" rx="${20 + rnd() * 50 | 0}" ry="${10 + rnd() * 30 | 0}" fill="#a07f45" opacity="${(.03 + rnd() * .05).toFixed(2)}"/>`;
    return s + '</svg>';
  }

  /* ---------- montagem ---------- */
  function figura(chave) {
    if (!cachePecas[chave]) cachePecas[chave] = Pecas.svg(chave[1], chave[0]);
    const el = document.createElement('div');
    el.className = 'fig';
    el.dataset.k = chave;
    el.innerHTML = `<i class="fg-sombra"></i><div class="fg-ancora"><div class="fg-bill"><div class="fg-esc">${cachePecas[chave]}</div></div></div>`;
    return el;
  }

  function montar(aoClicar) {
    aoClicarFn = aoClicar;
    raiz = $('tabuleiro'); mesa = $('mesa'); cena = $('cena');
    area = raiz.closest('.tabuleiro-area');
    raiz.innerHTML = '';
    raiz.style.setProperty('--textura-campo', texturaCampo());
    $('moldura').innerHTML = molduraSVG();

    for (let r = 0; r < 8; r++) {
      const fila = document.createElement('div');
      fila.className = 'fila';
      fila.setAttribute('role', 'row');
      casas[r] = [];
      for (let c = 0; c < 8; c++) {
        const casa = document.createElement('div');
        casa.className = 'casa ' + ((r + c) % 2 ? 'escura' : 'clara');
        casa.setAttribute('role', 'gridcell');
        casa.dataset.r = r; casa.dataset.c = c;
        casa.tabIndex = r === foco[0] && c === foco[1] ? 0 : -1;
        casa.setAttribute('aria-label', nomeCasa(r, c));
        casa.innerHTML = '<i class="marca" aria-hidden="true"></i>';
        casas[r][c] = casa;
        fila.appendChild(casa);
      }
      raiz.appendChild(fila);
    }
    camadaVoo = document.createElement('div');
    camadaVoo.className = 'voo';
    camadaVoo.setAttribute('aria-hidden', 'true');
    raiz.appendChild(camadaVoo);
    camadaFx = document.createElement('div');
    camadaFx.className = 'voo';
    camadaFx.setAttribute('aria-hidden', 'true');
    raiz.appendChild(camadaFx);

    raiz.addEventListener('click', e => {
      const casa = e.target.closest('.casa');
      if (!casa) return;
      definirFoco(+casa.dataset.r, +casa.dataset.c, false);
      esconderDica();
      aoClicarFn(+casa.dataset.r, +casa.dataset.c);
    });
    raiz.addEventListener('keydown', aoTeclar);
    raiz.addEventListener('pointermove', aoMoverPonteiro);
    raiz.addEventListener('pointerleave', esconderDica);
    raiz.addEventListener('pointerdown', esconderDica);

    dica = document.createElement('div');
    dica.className = 'dica-peca';
    dica.setAttribute('aria-hidden', 'true');
    area.appendChild(dica);

    montarBotaoVista();
    iniciarParalaxe();
  }

  // Põe o Reino Branco (false) ou o Negro (true) na parte de baixo da tela.
  // Só reordena as casas no DOM: cada casa guarda a coordenada lógica em data-r/data-c.
  function orientar(inv) {
    inv = !!inv;
    if (!raiz || inv === invertido) return;
    invertido = inv;
    const filas = $$('.fila', raiz);
    for (let vr = 0; vr < 8; vr++) {
      const r = inv ? 7 - vr : vr;
      for (let vc = 0; vc < 8; vc++) filas[vr].appendChild(casas[r][inv ? 7 - vc : vc]);
    }
    $('moldura').innerHTML = molduraSVG();
  }

  /* ---------- acessibilidade: setas, Enter/Espaço e tabindex móvel ---------- */
  function definirFoco(r, c, focar) {
    casas[foco[0]][foco[1]].tabIndex = -1;
    foco = [r, c];
    casas[r][c].tabIndex = 0;
    if (focar) casas[r][c].focus({ preventScroll: true });
  }
  function aoTeclar(e) {
    const casa = e.target.closest('.casa');
    if (!casa) return;
    let r = +casa.dataset.r, c = +casa.dataset.c;
    const mover = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    const s = invertido ? -1 : 1; // as setas seguem a tela, não as coordenadas
    if (mover) {
      e.preventDefault();
      definirFoco(limitar(r + s * mover[0], 0, 7), limitar(c + s * mover[1], 0, 7), true);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      definirFoco(r, (e.key === 'Home') !== invertido ? 0 : 7, true);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      esconderDica();
      aoClicarFn(r, c);
    }
  }

  /* ---------- dica ao passar o mouse sobre uma peça ---------- */
  function aoMoverPonteiro(e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    const casa = e.target.closest && e.target.closest('.casa');
    const fig = casa && casa.querySelector('.fig:not(.oculta)');
    clearTimeout(timerDica);
    if (!fig || animando) { dica.classList.remove('visivel'); return; }
    const chave = fig.dataset.k;
    dica.innerHTML = `<b>${NOME_PECA[chave[1]]}</b> <small>${NOME_REINO[chave[0]]}</small><em>${LEMA_PECA[chave[1]]}</em>`;
    dica.dataset.cor = chave[0];
    const x = Math.min(e.clientX + 16, window.innerWidth - 230), y = Math.min(e.clientY + 18, window.innerHeight - 80);
    dica.style.left = Math.max(6, x) + 'px';
    dica.style.top = Math.max(6, y) + 'px';
    timerDica = setTimeout(() => dica.classList.add('visivel'), 220);
  }
  function esconderDica() {
    clearTimeout(timerDica);
    if (dica) dica.classList.remove('visivel');
  }

  /* ---------- vista 2D/3D ---------- */
  function montarBotaoVista() {
    botaoVista = document.createElement('button');
    botaoVista.type = 'button';
    botaoVista.className = 'btn-vista';
    botaoVista.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 3 7v10l9 4.5 9-4.5V7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M3 7l9 4.5L21 7M12 11.5v10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg><span></span>';
    botaoVista.addEventListener('click', () => definirVista(vista === '3d' ? '2d' : '3d', true));
    area.insertBefore(botaoVista, area.firstChild);
    definirVista(lerArmazenado('xm-vista') === '2d' ? '2d' : '3d', false);
  }
  function definirVista(v, animar) {
    vista = v;
    if (animar) {
      mesa.classList.add('mudando');
      setTimeout(() => mesa.classList.remove('mudando'), 900);
    }
    area.dataset.vista = v;
    mesa.style.setProperty('--py', '0deg');
    mesa.style.setProperty('--pz', '0deg');
    botaoVista.setAttribute('aria-pressed', v === '2d' ? 'true' : 'false');
    botaoVista.setAttribute('aria-label', v === '2d' ? 'Alternar para a visão em 3D' : 'Alternar para a visão 2D, de cima');
    botaoVista.querySelector('span').textContent = v === '2d' ? 'Visão 3D' : 'Visão 2D';
    gravarArmazenado('xm-vista', v);
  }

  /* ---------- parallax sutil de câmera (mouse; desligado em touch e movimento reduzido) ---------- */
  function iniciarParalaxe() {
    if (movimentoReduzido() || window.matchMedia('(pointer: coarse)').matches) return;
    let alvoX = 0, alvoY = 0, x = 0, y = 0, quadro = 0;
    const passo = () => {
      x += (alvoX - x) * .07; y += (alvoY - y) * .07;
      mesa.style.setProperty('--pz', (x * 3.4).toFixed(2) + 'deg');
      mesa.style.setProperty('--py', (y * -2.2).toFixed(2) + 'deg');
      quadro = (Math.abs(alvoX - x) > .003 || Math.abs(alvoY - y) > .003) ? requestAnimationFrame(passo) : 0;
    };
    window.addEventListener('pointermove', e => {
      if (document.body.dataset.tela !== 'jogo' || vista === '2d' || e.pointerType === 'touch') return;
      alvoX = (e.clientX / window.innerWidth - .5) * 2;
      alvoY = (e.clientY / window.innerHeight - .5) * 2;
      if (!quadro) quadro = requestAnimationFrame(passo);
    });
  }

  /* ---------- desenhar: sincroniza peças e destaques ---------- */
  function rotuloCasa(S, r, c, p, lance) {
    let t = nomeCasa(r, c) + ', ' + (p ? `${NOME_PECA[p[1]]} do ${NOME_REINO[p[0]]}` : 'vazia');
    if (lance) t += (p || lance.f === 'ep') ? ', captura possível' : ', movimento possível';
    if (S.sel && S.sel[0] === r && S.sel[1] === c) t += ', selecionada';
    if (S.xeque && S.xeque[0] === r && S.xeque[1] === c) t += ', rei em xeque';
    return t;
  }

  function desenhar(S) {
    limparVoo();
    const mapa = {};
    for (const m of S.lances) mapa[m.r * 8 + m.c] = m;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const casa = casas[r][c], p = S.board[r][c], atual = casa.querySelector('.fig');
      const chave = p ? p[0] + p[1] : null;
      if (!chave && atual) atual.remove();
      else if (chave && (!atual || atual.dataset.k !== chave)) {
        if (atual) atual.remove();
        casa.appendChild(figura(chave));
      }
      const mv = mapa[r * 8 + c];
      casa.classList.toggle('selecionada', !!S.sel && S.sel[0] === r && S.sel[1] === c);
      casa.classList.toggle('possivel', !!mv && !p && mv.f !== 'ep');
      casa.classList.toggle('captura', !!mv && (!!p || mv.f === 'ep'));
      casa.classList.toggle('ultimo', !!S.ultimo && S.ultimo.some(x => x[0] === r && x[1] === c));
      casa.classList.toggle('xeque', !!S.xeque && S.xeque[0] === r && S.xeque[1] === c);
      casa.setAttribute('aria-label', rotuloCasa(S, r, c, p, mv));
      if (S.sel) casa.setAttribute('aria-selected', S.sel[0] === r && S.sel[1] === c ? 'true' : 'false');
      else casa.removeAttribute('aria-selected');
    }
  }

  function limparVoo() {
    if (!camadaVoo) return;
    camadaVoo.innerHTML = '';
    raiz.querySelectorAll('.fig.oculta').forEach(f => f.classList.remove('oculta'));
  }

  /* ---------- efeitos: partículas em 3D ---------- */
  const unidade = () => raiz.clientWidth / 8;
  const centroCasa = (r, c, u) => { const [vr, vc] = vis(r, c); return [(vc + .5) * u, (vr + .56) * u]; };

  // sprite em pé (billboard) preso a um ponto do tabuleiro
  function sprite(x, y) {
    const a = document.createElement('div');
    a.className = 'spr';
    a.style.left = x + 'px'; a.style.top = y + 'px';
    const b = document.createElement('div');
    b.className = 'spr-b';
    const i = document.createElement('i');
    i.className = 'spr-i';
    b.appendChild(i); a.appendChild(b);
    camadaFx.appendChild(a);
    return { a, i };
  }
  function descartar(el, anim, extra = 0) {
    anim.onfinish = () => el.remove();
    setTimeout(() => el.isConnected && el.remove(), anim.effect.getTiming().duration + extra + 200);
  }

  function poeira(r, c, u, forca = 1) {
    const [x, y] = centroCasa(r, c, u);
    for (let k = 0; k < 7; k++) {
      const { a, i } = sprite(x, y);
      const t = u * aleatorio(.2, .36) * forca;
      const dir = k % 2 ? 1 : -1, dx = dir * u * aleatorio(.25, .7) * forca, dy = -u * aleatorio(0, .22);
      i.style.cssText = `width:${t}px;height:${t}px;background:radial-gradient(circle,rgba(226,212,184,.75),rgba(150,130,100,.3) 60%,transparent 72%)`;
      const an = i.animate([
        { transform: 'translate(-50%,-50%) scale(.35)', opacity: .8 },
        { transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(1.7)`, opacity: 0 }
      ], { duration: aleatorio(420, 640), easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'forwards' });
      descartar(a, an);
    }
  }

  function faiscas(r, c, u, n, cor) {
    const [x, y] = centroCasa(r, c, u);
    for (let k = 0; k < n; k++) {
      const { a, i } = sprite(x, y - u * .35);
      const t = u * aleatorio(.1, .2), ang = aleatorio(0, Math.PI * 2), v = u * aleatorio(.5, 1.25);
      const dx = Math.cos(ang) * v, subir = -Math.abs(Math.sin(ang)) * v * .9 - u * .15, cair = u * aleatorio(.2, .55);
      const brilho = cor === 'sangue' ? 'rgba(255,90,50,.9)' : 'rgba(255,205,90,.9)';
      i.style.cssText = `width:${t}px;height:${t}px;background:radial-gradient(circle,#fff 0 14%,${brilho} 32%,transparent 68%)`;
      const an = i.animate([
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx * .6}px),calc(-50% + ${subir}px)) scale(1)`, opacity: 1, offset: .4 },
        { transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${cair}px)) scale(.2)`, opacity: 0 }
      ], { duration: aleatorio(460, 800), easing: 'cubic-bezier(.2,.6,.5,1)', fill: 'forwards' });
      descartar(a, an);
    }
  }

  // estilhaços achatados voando em 3D (giram, sobem e caem)
  function estilhacos(r, c, u, cor, n = 12) {
    const [x, y] = centroCasa(r, c, u);
    for (let k = 0; k < n; k++) {
      const el = document.createElement('i');
      el.className = 'estilhaco ' + (cor === 'w' ? 'est-w' : 'est-b');
      const t = u * aleatorio(.18, .34);
      el.style.cssText = `left:${x}px;top:${y}px;width:${t}px;height:${t}px;clip-path:polygon(${Math.random() < .5 ? '0 0,100% 20%,40% 100%' : '10% 0,100% 60%,0 100%'})`;
      camadaFx.appendChild(el);
      const ang = aleatorio(0, Math.PI * 2), vel = u * aleatorio(.45, 1.1);
      const vx = Math.cos(ang) * vel, vy = Math.sin(ang) * vel * .8, vz = u * aleatorio(.9, 2.1);
      const g = vz * 2.4, sx = aleatorio(240, 760), sy = aleatorio(240, 760), sz = aleatorio(-500, 500);
      const q = [];
      for (let i = 0; i <= 12; i++) {
        const tt = i / 12, z = Math.max(0, vz * tt * 1.15 - g * tt * tt * .62);
        q.push({ transform: `translate3d(${vx * tt}px,${vy * tt}px,${z}px) rotateX(${sx * tt}deg) rotateY(${sy * tt}deg) rotateZ(${sz * tt}deg)`, opacity: tt > .8 ? 1 - (tt - .8) * 5 : 1, offset: tt });
      }
      const an = el.animate(q, { duration: aleatorio(700, 1000), easing: 'linear', fill: 'forwards' });
      descartar(el, an);
    }
  }

  // onda de choque achatada no plano do tabuleiro
  function onda(r, c, u, tipo) {
    const [x, y] = centroCasa(r, c, u);
    const el = document.createElement('i');
    el.className = 'onda onda-' + tipo;
    el.style.cssText = `left:${x}px;top:${y}px;width:${u * 1.1}px;height:${u * 1.1}px`;
    camadaFx.appendChild(el);
    const an = el.animate([
      { transform: 'translate(-50%,-50%) scale(.25)', opacity: .95 },
      { transform: `translate(-50%,-50%) scale(${tipo === 'captura' ? 2.6 : 1.8})`, opacity: 0 }
    ], { duration: tipo === 'captura' ? 620 : 480, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'forwards' });
    descartar(el, an);
  }

  function tremer(forca) {
    if (movimentoReduzido() || !cena) return;
    const q = [];
    for (let i = 0; i <= 7; i++) {
      const f = (1 - i / 7) * forca;
      q.push({ transform: `translate(${(Math.random() - .5) * 2 * f}px,${(Math.random() - .5) * 2 * f}px)` });
    }
    q[7] = { transform: 'translate(0,0)' };
    cena.animate(q, { duration: 300, easing: 'linear' });
  }

  /* ---------- animação do lance ---------- */
  // Faz a peça levantar, voar em arco e pousar. Devolve o tempo (ms) até o pouso.
  function voar(fr, fc, r, c, o) {
    const origem = casas[fr][fc], fig = origem.querySelector('.fig');
    if (!fig) return;
    const u = unidade(), clone = fig.cloneNode(true);
    const [vfr, vfc] = vis(fr, fc), [vr, vc] = vis(r, c);
    clone.classList.add('voando');
    clone.style.cssText = `left:${vfc * u}px;top:${vfr * u}px;width:${u}px;height:${u}px`;
    camadaVoo.appendChild(clone);
    fig.classList.add('oculta');

    const dx = (vc - vfc) * u, dy = (vr - vfr) * u;
    const dist = Math.max(Math.abs(r - fr), Math.abs(c - fc));
    const H = o.reduzido ? 0 : (o.tipo === 'N' ? 2.0 : Math.min(1.35, .6 + .15 * dist)) * u * (o.altura || 1);
    const sinal = Math.sign(dx) || 1;
    const N = 30, peca = [], sombra = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, s = limitar((t - .04) / .86, 0, 1);
      const h = .55 * s + .45 * suave(s);
      const z = H * (1 - Math.pow(2 * s - 1, 2));
      const alto = H ? z / H : 0;
      peca.push({ transform: `translate3d(${dx * h}px,${dy * h}px,${z}px)`, offset: t });
      sombra.push({ transform: `translate3d(${dx * h}px,${dy * h}px,1.5px) scale(${1 - .38 * alto})`, opacity: 1 - .5 * alto, offset: t });
    }
    const opcoes = { duration: o.D, easing: 'linear', fill: 'forwards', delay: o.atraso || 0 };
    clone.querySelector('.fg-ancora').animate(peca, opcoes);
    clone.querySelector('.fg-sombra').animate(sombra, opcoes);
    if (!o.reduzido) {
      clone.querySelector('.fg-esc').animate([
        { transform: 'scale(1,1) rotate(0deg)', offset: 0 },
        { transform: 'scale(.93,1.1) rotate(0deg)', offset: .1 },
        { transform: `scale(1.04,.98) rotate(${sinal * 4}deg)`, offset: .45 },
        { transform: 'scale(1,1.02) rotate(0deg)', offset: .86 },
        { transform: 'scale(1.14,.84) rotate(0deg)', offset: .92 },
        { transform: 'scale(.98,1.04) rotate(0deg)', offset: .96 },
        { transform: 'scale(1,1) rotate(0deg)', offset: 1 }
      ], opcoes);
    }
    return o.D * .9 + (o.atraso || 0);
  }

  // a vítima é arremessada para longe do atacante: voa em arco no plano do tabuleiro, gira e se desfaz
  function derrubar(r, c, cor, ax, ay, u) {
    const origem = casas[r][c].querySelector('.fig');
    if (!origem) return;
    const fig = origem.cloneNode(true);
    const [vr, vc] = vis(r, c);
    if (invertido) { ax = -ax; ay = -ay; } // direção do ataque na tela
    fig.classList.add('voando');
    fig.style.cssText = `left:${vc * u}px;top:${vr * u}px;width:${u}px;height:${u}px`;
    camadaFx.appendChild(fig);
    origem.classList.add('oculta');
    const len = Math.hypot(ax, ay) || 1;
    let ux = ax / len, uy = ay / len;
    if (!ax && !ay) { ux = 0; uy = -1; }
    const sinal = Math.abs(ux) > .2 ? Math.sign(ux) : (Math.random() < .5 ? 1 : -1);
    const D = 520, voo = [], giro = [], som = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14, e = 1 - Math.pow(1 - t, 2), z = u * 1.1 * 4 * t * (1 - t);
      voo.push({ transform: `translate3d(${ux * 1.2 * u * e}px,${uy * 1.2 * u * e}px,${z}px)`, offset: t });
      giro.push({ transform: `rotate(${sinal * 110 * e}deg) scale(${t < .15 ? 1.08 : 1 - .25 * t})`, filter: t < .3 ? 'brightness(2.4) saturate(.5)' : 'brightness(1.1)', opacity: t < .62 ? 1 : 1 - (t - .62) / .38, offset: t });
      som.push({ transform: `translate3d(${ux * 1.2 * u * e}px,${uy * 1.2 * u * e}px,1.5px) scale(${1 - .5 * (z / (u * 1.1))})`, opacity: t < .6 ? 1 : 1 - (t - .6) / .4, offset: t });
    }
    const opcoes = { duration: D, easing: 'linear', fill: 'forwards' };
    fig.querySelector('.fg-ancora').animate(voo, opcoes);
    fig.querySelector('.fg-esc').animate(giro, opcoes);
    fig.querySelector('.fg-sombra').animate(som, opcoes);
    setTimeout(() => fig.remove(), D + 40);
    estilhacos(r, c, u, cor, 10);
    faiscas(r, c, u, 18, cor === 'b' ? 'sangue' : 'ouro');
    onda(r, c, u, 'captura');
  }

  async function animarLance(S, mv) {
    if (!raiz || !raiz.clientWidth) return;
    const p = S.board[mv.fr][mv.fc];
    if (!p) return;
    limparVoo();
    const u = unidade(), reduzido = movimentoReduzido();
    const dist = Math.max(Math.abs(mv.r - mv.fr), Math.abs(mv.c - mv.fc));
    const cap = Regras.casaCapturada(S, mv);
    const D = reduzido ? 100 : Math.round(p[1] === 'N' ? 650 : 480 + dist * 22);
    animando = true;
    esconderDica();

    voar(mv.fr, mv.fc, mv.r, mv.c, { D, tipo: p[1], reduzido, altura: cap ? 1.12 : 1 });
    if (mv.f === 'ck' || mv.f === 'cq') {
      const [de, para] = mv.f === 'ck' ? [7, 5] : [0, 3];
      voar(mv.fr, de, mv.fr, para, { D, tipo: 'R', reduzido, altura: 1.5 });
    }

    const tPouso = D * .9;
    if (!reduzido) {
      if (cap) {
        const vitima = S.board[cap[0]][cap[1]];
        setTimeout(() => {
          derrubar(cap[0], cap[1], vitima ? vitima[0] : outraCor(p[0]), mv.c - mv.fc, mv.r - mv.fr, u);
          poeira(mv.r, mv.c, u, 1.3);
          tremer(5);
        }, tPouso - 40);
      } else {
        setTimeout(() => { poeira(mv.r, mv.c, u); onda(mv.r, mv.c, u, 'pouso'); }, tPouso);
        if (mv.f === 'ck' || mv.f === 'cq') setTimeout(() => poeira(mv.fr, mv.f === 'ck' ? 5 : 3, u), tPouso);
      }
    } else if (cap) {
      const fig = casas[cap[0]][cap[1]].querySelector('.fig');
      if (fig) fig.classList.add('oculta');
    }
    await esperar(D + (cap && !reduzido ? 150 : 30));
    animando = false;
  }

  /* ---------- reações do ambiente (usadas por 35-ambiente.js) ---------- */
  function marcarFim(vencedor, casaRei, casaVencedor) {
    limparFim();
    const perdedor = casas[casaRei[0]][casaRei[1]];
    perdedor.classList.add('derrotado');
    if (casaVencedor) {
      const vit = casas[casaVencedor[0]][casaVencedor[1]];
      vit.classList.add('vencedor');
      if (!vit.querySelector('.raio')) vit.insertAdjacentHTML('beforeend', '<i class="raio" aria-hidden="true"></i>');
    }
  }
  function limparFim() {
    if (!raiz) return;
    camadaFx.innerHTML = '';
    raiz.querySelectorAll('.derrotado,.vencedor').forEach(c => c.classList.remove('derrotado', 'vencedor'));
    raiz.querySelectorAll('.raio').forEach(e => e.remove());
  }
  // coluna de luz dourada sobre uma casa (promoção)
  function raio(casa) {
    const el = casas[casa[0]][casa[1]];
    el.querySelectorAll('.raio-promo').forEach(e => e.remove());
    el.insertAdjacentHTML('beforeend', '<i class="raio raio-promo" aria-hidden="true"></i>');
    const no = el.querySelector('.raio-promo');
    setTimeout(() => no.remove(), 2200);
    if (!movimentoReduzido()) {
      const u = unidade();
      onda(casa[0], casa[1], u, 'pouso');
      faiscas(casa[0], casa[1], u, 22, 'ouro');
    }
  }
  const retanguloCasa = (r, c) => casas[r][c].getBoundingClientRect();

  return { montar, orientar, desenhar, animarLance, marcarFim, limparFim, raio, retanguloCasa, tremer };
})();

/* ============================================================
   AMBIENTE
   ============================================================ */
/* Ambiente de batalha atrás da partida: céu, castelos, tochas, brasas, névoa e reações ao jogo.
   Contrato: Ambiente.reagir(evento, dados)
     'inicio' | 'lance' {cor} | 'captura' | 'roque' | 'promocao' {casa} | 'xeque' {cor, casa} | 'fim-xeque'
     'xequemate' {vencedor, casaRei, casaVencedor} | 'empate'
   Estado em classes no #ambiente, no #mesa e no body (prefixo fase-). */
const Ambiente = (() => {
  let el, mesa, montado = false;
  let timers = [];
  const aleatorio = (a, b) => a + Math.random() * (b - a);

  /* ---------- desenhos em SVG ---------- */
  const ameias = (x, y, w, passo, h, fill) => {
    let d = '';
    for (let a = x; a < x + w - passo * .4; a += passo * 2) d += `M${a} ${y}h${passo}v${-h}h${-passo}z`;
    return `<path d="${d}" fill="${fill}"/>`;
  };
  const janela = (x, y, cls = '') => `<path class="jan ${cls}" d="M${x} ${y}v13a5 5 0 0 1 10 0v-13a5 5 0 0 0-10 0z" fill="#ffd27a"/>`;

  // Cada castelo vem em duas camadas SVG idênticas: a estática (rasterizada uma vez)
  // e a animada (só bandeiras e janelas), para a animação ficar barata.
  const camadasSVG = (vb, alinhar, defs, estatico, animado) =>
    `<svg viewBox="${vb}" preserveAspectRatio="${alinhar}" aria-hidden="true" focusable="false"><defs>${defs}</defs>${estatico}</svg>` +
    `<svg class="anim" viewBox="${vb}" preserveAspectRatio="${alinhar}" aria-hidden="true" focusable="false">${animado}</svg>`;

  function casteloBranco() {
    const torre = (x, w, topo, telhado) => {
      let s = `<rect x="${x}" y="${topo}" width="${w}" height="${380 - topo}" fill="url(#cb-pedra)"/>`;
      s += ameias(x - 3, topo, w + 6, 7, 9, 'url(#cb-pedra)');
      if (telhado) s += `<path d="M${x - 8} ${topo - 9}L${x + w / 2} ${topo - 9 - telhado}L${x + w + 8} ${topo - 9}Z" fill="url(#cb-telha)"/><path d="M${x + w / 2} ${topo - 9 - telhado}L${x + w + 8} ${topo - 9}H${x + w / 2}Z" fill="#000" opacity=".22"/>`;
      return s;
    };
    const defs = `
        <linearGradient id="cb-pedra" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f4e8c8"/><stop offset=".55" stop-color="#cfc3a2"/><stop offset="1" stop-color="#8c826a"/></linearGradient>
        <linearGradient id="cb-telha" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8e9bb8"/><stop offset="1" stop-color="#46506a"/></linearGradient>
        <linearGradient id="cb-colina" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4b4a36"/><stop offset="1" stop-color="#12110d"/></linearGradient>
        <linearGradient id="cb-ban" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6dc86"/><stop offset="1" stop-color="#b78a2a"/></linearGradient>`;
    const estatico = `
      <path d="M0 400V335Q110 300 250 330T520 322Q600 312 660 330V400Z" fill="url(#cb-colina)"/>
      <rect x="30" y="300" width="610" height="90" fill="url(#cb-pedra)"/>${ameias(30, 300, 610, 8, 10, 'url(#cb-pedra)')}
      ${torre(18, 76, 200, 80)}${torre(566, 76, 215, 74)}${torre(128, 62, 238, 56)}${torre(470, 62, 228, 60)}${torre(244, 172, 120, 0)}
      <rect x="296" y="62" width="68" height="66" fill="url(#cb-pedra)"/>${ameias(293, 62, 74, 7, 9, 'url(#cb-pedra)')}
      <path d="M288 54L330 -34L372 54Z" fill="url(#cb-telha)"/><path d="M330 -34L372 54H330Z" fill="#000" opacity=".22"/>
      <path d="M330 -34V-58M56 130V108M604 142V120" stroke="#e8d9a8" stroke-width="2.4"/>
      <path d="M312 390V338a18 18 0 0 1 36 0V390Z" fill="#15100a"/><path d="M318 390V340a12 12 0 0 1 24 0V390Z" fill="#ffb95a" opacity=".5"/>
      <rect x="0" y="388" width="660" height="12" fill="#0e0d0a"/>`;
    const animado = `
      <path class="bandeira" d="M331 -57h44l-9 11l9 11h-44z" fill="url(#cb-ban)" stroke="#6e5016" stroke-width="1.2"/>
      <path class="bandeira b2" d="M57 107h38l-8 10l8 10h-38z" fill="url(#cb-ban)" stroke="#6e5016" stroke-width="1.2"/>
      <path class="bandeira b3" d="M605 119h38l-8 10l8 10h-38z" fill="url(#cb-ban)" stroke="#6e5016" stroke-width="1.2"/>
      <path d="M262 150h26v62l-13-12l-13 12z" fill="url(#cb-ban)" stroke="#6e5016" stroke-width="1.2" class="pendao"/><path d="M372 150h26v62l-13-12l-13 12z" fill="url(#cb-ban)" stroke="#6e5016" stroke-width="1.2" class="pendao p2"/>
      ${janela(318, 150)}${janela(342, 150, 'j2')}${janela(330, 188, 'j3')}${janela(34, 232)}${janela(60, 250, 'j2')}${janela(584, 245)}${janela(140, 270, 'j3')}${janela(484, 262, 'j2')}${janela(504, 262)}`;
    return camadasSVG('0 -60 660 460', 'xMinYMax meet', defs, estatico, animado);
  }

  function fortalezaNegra() {
    const torre = (x, w, topo, telhado) => {
      let s = `<rect x="${x}" y="${topo}" width="${w}" height="${420 - topo}" fill="url(#fn-pedra)"/>`;
      s += `<path d="M${x - 8} ${topo}L${x + w / 2} ${topo - telhado}L${x + w + 8} ${topo}Z" fill="#0a0707"/><path d="M${x + w / 2} ${topo - telhado}L${x - 8} ${topo}H${x + 2}Z" fill="#6e1414" opacity=".5"/>`;
      s += `<path d="M${x - 4} ${topo}h${w + 8}v10h-${w + 8}z" fill="#0a0707"/>`;
      return s;
    };
    const fenda = (x, y, h = 18) => `<rect class="jan jr" x="${x}" y="${y}" width="5" height="${h}" rx="2.5" fill="#ff5a32"/>`;
    const defs = `
        <linearGradient id="fn-pedra" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a1c20"/><stop offset=".4" stop-color="#1a1213"/><stop offset="1" stop-color="#070505"/></linearGradient>
        <linearGradient id="fn-rocha" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2c1a1c"/><stop offset=".5" stop-color="#120c0d"/><stop offset="1" stop-color="#060404"/></linearGradient>
        <linearGradient id="fn-ban" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b3201e"/><stop offset="1" stop-color="#5a0a0e"/></linearGradient>`;
    const estatico = `
      <path d="M0 620V330L26 300L52 318L88 262L120 292L158 244L196 270L232 232L560 230V620Z" fill="url(#fn-rocha)"/>
      <path d="M40 330L64 372L52 420L80 470M120 300L150 350L132 410L170 456M200 280L230 330L214 380M300 300L322 350L310 420L336 480M430 280L452 340L440 410" stroke="#c2361f" stroke-width="2.2" fill="none" opacity=".55" stroke-linecap="round"/>
      <rect x="130" y="250" width="430" height="190" fill="url(#fn-pedra)"/>
      <path d="${'M130 250' + 'l10 -16l10 16'.repeat(43)}z" fill="#0a0707"/>
      ${torre(176, 62, 130, 82)}${torre(486, 70, 112, 92)}${torre(330, 90, 40, 124)}${torre(262, 46, 170, 62)}${torre(428, 44, 160, 58)}
      <path d="M374 -84V-132M221 48V8M521 20V-24" stroke="#0a0707" stroke-width="3.2"/>
      <path d="M340 440V360a40 40 0 0 1 80 0V440Z" fill="#050303"/><path d="M350 440V362a30 30 0 0 1 60 0V440Z" fill="#c2361f" opacity=".55"/>
      <path d="M350 372H410M350 392H410M350 412H410M366 346V440M380 340V440M394 346V440" stroke="#050303" stroke-width="2.6"/>`;
    const animado = `
      <path class="bandeira" d="M375 -130h-48l10 12l-10 12l10 12l-10 12h48z" fill="url(#fn-ban)" stroke="#2a0507" stroke-width="1.4"/>
      <path class="bandeira b2" d="M222 10h-40l8 10l-8 10l8 10h40z" fill="url(#fn-ban)" stroke="#2a0507" stroke-width="1.4"/>
      <path class="bandeira b3" d="M522 -22h-42l8 11l-8 11l8 11h42z" fill="url(#fn-ban)" stroke="#2a0507" stroke-width="1.4"/>
      <path class="pendao" d="M352 150h30v78l-8 -10l-7 12l-8 -12l-7 10z" fill="url(#fn-ban)" stroke="#2a0507" stroke-width="1.2"/>
      <path class="pendao p2" d="M196 190h22v60l-6 -8l-5 9l-5 -9l-6 8z" fill="url(#fn-ban)" stroke="#2a0507" stroke-width="1.2"/>
      ${fenda(366, 90, 26)}${fenda(194, 168)}${fenda(509, 150, 22)}${fenda(437, 202, 16)}${fenda(272, 214, 14)}${fenda(388, 128, 20)}${fenda(350, 278, 16)}${fenda(466, 310, 16)}${fenda(224, 300, 16)}`;
    return camadasSVG('0 -90 560 710', 'xMaxYMin meet', defs, estatico, animado);
  }

  /* ---------- montagem ---------- */
  function estrelas(n) {
    let sombras = [];
    for (let i = 0; i < n; i++) {
      const c = Math.random() < .2 ? '255,214,150' : (Math.random() < .3 ? '190,200,255' : '255,255,255');
      sombras.push(`${(aleatorio(0, 100)).toFixed(1)}vw ${(aleatorio(0, 54)).toFixed(1)}vh 0 ${(aleatorio(0, 1.1)).toFixed(1)}px rgba(${c},${aleatorio(.3, .95).toFixed(2)})`);
    }
    return sombras.join(',');
  }

  function tocha(cls, estilo) {
    return `<div class="tocha ${cls}" style="${estilo}"><i class="halo"></i><i class="haste"></i><i class="cesto"></i><span class="chama"><i class="f1"></i><i class="f2"></i><i class="f3"></i></span></div>`;
  }

  function brasas(n) {
    let s = '';
    for (let i = 0; i < n; i++) {
      const x = aleatorio(0, 100), reino = x < 50 ? 'w' : 'n', t = aleatorio(2, 5.2);
      s += `<i class="brasa brasa-${reino}" style="left:${x.toFixed(1)}%;width:${t.toFixed(1)}px;height:${t.toFixed(1)}px;--dx:${aleatorio(-14, 14).toFixed(1)}vw;--dur:${aleatorio(9, 20).toFixed(1)}s;--atraso:${(-aleatorio(0, 20)).toFixed(1)}s"></i>`;
    }
    return s;
  }

  function montar() {
    el = $('ambiente'); mesa = $('mesa');
    if (!el || montado) return;
    montado = true;
    el.dataset.luz = 'w';
    el.innerHTML = `
      <div class="amb-ceu"></div>
      <div class="amb-estrelas"><i style="box-shadow:${estrelas(70)}"></i><i class="e2" style="box-shadow:${estrelas(40)}"></i></div>
      <div class="amb-lua"></div>
      <svg class="amb-serra" viewBox="0 0 1200 200" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M0 200V120L80 88L150 118L240 60L330 112L420 84L520 128L610 78L700 120L790 70L880 116L980 82L1080 122L1200 90V200Z" fill="#241326"/><path d="M0 200V150L110 126L200 150L300 112L410 148L520 120L640 152L760 118L880 150L1000 122L1120 152L1200 134V200Z" fill="#170d1a"/></svg>
      <div class="amb-chao"></div>
      <div class="amb-castelo amb-castelo-w">${casteloBranco()}</div>
      <div class="amb-castelo amb-castelo-n">${fortalezaNegra()}</div>
      <div class="amb-nevoa n1"></div><div class="amb-nevoa n2"></div>
      <div class="amb-luz amb-luz-w"></div><div class="amb-luz amb-luz-n"></div>
      <div class="amb-raios"></div>
      <div class="amb-tinta"></div>
      ${tocha('tocha-w', 'left:3.5vw;bottom:30vh')}${tocha('tocha-w t2', 'left:17vw;bottom:9vh')}
      ${tocha('tocha-n', 'right:3.5vw;bottom:30vh')}${tocha('tocha-n t2', 'right:17vw;bottom:9vh')}
      <div class="amb-brasas">${brasas(24)}</div>
      <div class="amb-chuva"></div>
      <div class="amb-vinheta"></div>
      <div class="amb-xeque"></div>
      <div class="amb-relampago"></div>
      <div class="amb-flash"></div>
      <div class="amb-feixes"></div>`;
  }

  /* ---------- reações ---------- */
  const marcar = (cls, ligar) => {
    el.classList.toggle(cls, ligar);
    if (mesa) mesa.classList.toggle(cls, ligar);
    document.body.classList.toggle('fase-' + cls, ligar);
  };
  const agendar = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); };
  const limparTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const reiniciarAnim = (alvo, cls) => { alvo.classList.remove(cls); void alvo.offsetWidth; alvo.classList.add(cls); };

  function limparEstado() {
    limparTimers();
    ['xeque', 'mate', 'mate-w', 'mate-b', 'empate'].forEach(c => marcar(c, false));
    el.dataset.xeque = '';
    el.querySelector('.amb-chuva').innerHTML = '';
    el.querySelector('.amb-feixes').innerHTML = '';
    Tabuleiro.limparFim();
  }

  function luz(cor) {
    el.dataset.luz = cor;
    if (mesa) mesa.dataset.luz = cor;
  }

  function chover(vencedor) {
    const caixa = el.querySelector('.amb-chuva');
    const n = movimentoReduzido() ? 18 : 70;
    let s = '';
    for (let i = 0; i < n; i++) {
      const t = aleatorio(4, 10);
      s += `<i class="gota gota-${vencedor}" style="left:${aleatorio(0, 100).toFixed(1)}%;width:${t.toFixed(1)}px;height:${(vencedor === 'w' ? t * 1.6 : t * 2.6).toFixed(1)}px;--dur:${aleatorio(2.6, 6).toFixed(1)}s;--atraso:${(-aleatorio(0, 6)).toFixed(1)}s;--dx:${aleatorio(-6, 6).toFixed(1)}vw;--giro:${aleatorio(-200, 200) | 0}deg"></i>`;
    }
    caixa.innerHTML = s;
  }

  // coluna de luz vinda do alto até a casa indicada (promoção, vitória)
  function feixe(casa, cor) {
    const alvo = Tabuleiro.retanguloCasa(casa[0], casa[1]);
    if (!alvo.width) return;
    const f = document.createElement('i');
    f.className = 'feixe feixe-' + cor;
    const larg = Math.max(60, alvo.width * 1.7);
    f.style.cssText = `left:${alvo.left + alvo.width / 2 - larg / 2}px;width:${larg}px;height:${alvo.top + alvo.height * .6}px`;
    el.querySelector('.amb-feixes').appendChild(f);
    agendar(() => f.remove(), cor === 'mate' ? 60000 : 2400);
  }

  function reagir(evento, dados = {}) {
    if (!montado) montar();
    if (!el) return;
    switch (evento) {
      case 'inicio':
        limparEstado();
        luz(dados.cor || 'w');
        break;
      case 'lance':
        if (!el.classList.contains('mate') && !el.classList.contains('empate')) luz(dados.cor);
        break;
      case 'captura':
        reiniciarAnim(el.querySelector('.amb-flash'), 'ativo');
        Tabuleiro.tremer(6);
        break;
      case 'roque':
        reiniciarAnim(el.querySelector('.amb-flash'), 'ativo');
        break;
      case 'xeque':
        marcar('xeque', true);
        el.dataset.xeque = dados.cor;
        break;
      case 'fim-xeque':
        marcar('xeque', false);
        break;
      case 'promocao':
        reiniciarAnim(el.querySelector('.amb-flash'), 'ativo');
        feixe(dados.casa, 'promo');
        Tabuleiro.raio(dados.casa);
        break;
      case 'xequemate': {
        marcar('xeque', false);
        marcar('mate', true);
        marcar('mate-' + dados.vencedor, true);
        luz(dados.vencedor);
        Tabuleiro.marcarFim(dados.vencedor, dados.casaRei, dados.casaVencedor);
        reiniciarAnim(el.querySelector('.amb-flash'), 'ativo');
        Tabuleiro.tremer(9);
        chover(dados.vencedor);
        agendar(() => { if (dados.casaVencedor) feixe(dados.casaVencedor, 'mate'); }, 120);
        break;
      }
      case 'empate':
        marcar('xeque', false);
        marcar('empate', true);
        break;
    }
  }

  // monta cedo, para que a cena já exista ao abrir a tela de jogo
  if (document.readyState !== 'loading') montar();
  else document.addEventListener('DOMContentLoaded', montar);

  return { reagir, montar };
})();

/* ============================================================
   BOT
   ============================================================ */
/* ==========================================================================
   BOT — três níveis distintos
   - Fácil: quase aleatório (capturas ocasionais), roda direto na página.
   - Médio: negamax de profundidade 2 + quiescência curta, com variedade.
   - Difícil: aprofundamento iterativo com alfa-beta, tabela de transposição,
     ordenação de lances, killers, quiescência e avaliação completa.
   Médio e Difícil rodam num Web Worker criado a partir de um Blob (a interface
   não trava). Se o Worker falhar, a busca roda na página com tempo reduzido.
   Contrato: Bot.escolher(pos, nivel, historico) -> Promise<lance>, Bot.reiniciar()
   ========================================================================== */

/* ---------- MOTOR DE BUSCA (autocontido: o código-fonte vai para o Worker) ---------- */
function criarMotor() {
  'use strict';
  const INF = 32000, MATE = 30000, MAXP = 96;
  // peça = tipo (1 P, 2 N, 3 B, 4 R, 5 Q, 6 K) | (cor << 3); cor 0 = branco, 1 = preto
  // casa 0x88: (linha << 4) | coluna, linha 0 = fileira 8
  const B = new Int8Array(128);
  const kingSq = new Int32Array(2);
  const npm = new Int32Array(2); // material não-peão por cor
  const NV = [0, 0, 1, 1, 2, 4, 0, 0];
  const VAL = [0, 100, 320, 330, 500, 900, 20000, 0];
  const NOFF = [-33, -31, -18, -14, 14, 18, 31, 33];
  const KOFF = [-17, -16, -15, -1, 1, 15, 16, 17];
  const DDIR = [-17, -15, 15, 17];
  const ODIR = [-16, -1, 1, 16];
  let side = 0, castle = 0, ep = -1, half = 0, hlo = 0, hhi = 0;

  /* --- Zobrist --- */
  let semente = 0x9e3779b9;
  const rnd = () => { semente ^= semente << 13; semente ^= semente >>> 17; semente ^= semente << 5; return semente | 0; };
  const ZL = new Int32Array(16 * 128), ZH = new Int32Array(16 * 128);
  for (let i = 0; i < ZL.length; i++) { ZL[i] = rnd(); ZH[i] = rnd(); }
  const SL = rnd(), SH = rnd();
  const CL = new Int32Array(16), CH = new Int32Array(16), EL = new Int32Array(8), EH = new Int32Array(8);
  for (let i = 0; i < 16; i++) { CL[i] = rnd(); CH[i] = rnd(); }
  for (let i = 0; i < 8; i++) { EL[i] = rnd(); EH[i] = rnd(); }
  const CR = new Int32Array(128).fill(15);
  CR[0x74] = 12; CR[0x77] = 14; CR[0x70] = 13; CR[0x04] = 3; CR[0x07] = 11; CR[0x00] = 7;

  /* --- Tabelas peça-casa (visão das brancas, linha 0 = fileira 8) --- */
  const PST = [null,
    [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5,
     0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30,
     -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
    [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10,
     -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,
     -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
    [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5,
     0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20]
  ];
  const KMG = [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10,
    20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20];
  const KEG = [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30,
    -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30,
    -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50];
  const PASSADO = [0, 10, 20, 35, 60, 100, 0, 0];
  const ATAQUE_REI = [0, 0, 4, 10, 20, 32, 46, 62, 80, 100, 120, 140];

  /* --- Estado da busca --- */
  const MV = new Int32Array(MAXP * 256), SC = new Int32Array(MAXP * 256);
  const uMove = new Int32Array(MAXP * 4), uCap = new Int32Array(MAXP * 4), uCastle = new Int32Array(MAXP * 4);
  const uEp = new Int32Array(MAXP * 4), uHalf = new Int32Array(MAXP * 4), uLo = new Int32Array(MAXP * 4), uHi = new Int32Array(MAXP * 4);
  let sp = 0;
  const seenLo = new Int32Array(2048), seenHi = new Int32Array(2048);
  let seenN = 0;
  const K1 = new Int32Array(MAXP), K2 = new Int32Array(MAXP);
  const H = new Int32Array(128 * 128);
  const TTN = 1 << 19, TTM = TTN - 1;
  const ttHi = new Int32Array(TTN), ttMove = new Int32Array(TTN), ttScore = new Int16Array(TTN);
  const ttDepth = new Int8Array(TTN), ttFlag = new Int8Array(TTN), ttAge = new Uint8Array(TTN);
  let idade = 0, nos = 0, parar = false, prazo = 0, qLim = 8;

  /* --- Ataques --- */
  function atacada(sq, por) {
    let s;
    const base = por << 3;
    if (por === 0) {
      s = sq + 15; if (!(s & 0x88) && B[s] === 1) return true;
      s = sq + 17; if (!(s & 0x88) && B[s] === 1) return true;
    } else {
      s = sq - 15; if (!(s & 0x88) && B[s] === 9) return true;
      s = sq - 17; if (!(s & 0x88) && B[s] === 9) return true;
    }
    for (let i = 0; i < 8; i++) {
      s = sq + NOFF[i]; if (!(s & 0x88) && B[s] === (base | 2)) return true;
      s = sq + KOFF[i]; if (!(s & 0x88) && B[s] === (base | 6)) return true;
    }
    for (let i = 0; i < 4; i++) {
      let d = DDIR[i];
      s = sq + d;
      while (!(s & 0x88)) { const p = B[s]; if (p) { if (p === (base | 3) || p === (base | 5)) return true; break; } s += d; }
      d = ODIR[i];
      s = sq + d;
      while (!(s & 0x88)) { const p = B[s]; if (p) { if (p === (base | 4) || p === (base | 5)) return true; break; } s += d; }
    }
    return false;
  }

  /* --- Geração de lances --- */
  let gn = 0, gBase = 0, gPly = 0, gTT = 0;
  function add(from, to, extra) {
    const m = from | (to << 7) | extra;
    const v = B[to];
    let s;
    if (v) s = 100000 + (v & 7) * 16 - (B[from] & 7);
    else if ((extra >> 17) === 2) s = 100015;
    else {
      s = H[from * 128 + to];
      if (m === K1[gPly]) s += 90000; else if (m === K2[gPly]) s += 80000;
    }
    const pr = (extra >> 14) & 7;
    if (pr) s += pr * 1000 + 50000;
    if (m === gTT) s = 10000000;
    MV[gBase + gn] = m; SC[gBase + gn] = s; gn++;
  }
  function addPromos(from, to, caps) {
    add(from, to, 5 << 14);
    if (!caps) { add(from, to, 4 << 14); add(from, to, 3 << 14); add(from, to, 2 << 14); }
  }
  function gen(base, caps, ply, ttm) {
    gn = 0; gBase = base; gPly = ply < MAXP ? ply : 0; gTT = ttm;
    const us = side, opp = us ^ 1;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = (r << 4) | c, p = B[sq];
        if (!p || (p >> 3) !== us) continue;
        const t = p & 7;
        if (t === 1) {
          const dir = us === 0 ? -16 : 16, ini = us === 0 ? 6 : 1, ult = us === 0 ? 1 : 6;
          let to = sq + dir;
          if (!B[to]) {
            if (r === ult) addPromos(sq, to, caps);
            else if (!caps) { add(sq, to, 0); if (r === ini && !B[to + dir]) add(sq, to + dir, 1 << 17); }
          }
          for (let d = -1; d <= 1; d += 2) {
            to = sq + dir + d;
            if (to & 0x88) continue;
            const tg = B[to];
            if (tg && (tg >> 3) !== us) { if (r === ult) addPromos(sq, to, caps); else add(sq, to, 0); }
            else if (!tg && to === ep) add(sq, to, 2 << 17);
          }
        } else if (t === 2 || t === 6) {
          const offs = t === 2 ? NOFF : KOFF;
          for (let i = 0; i < 8; i++) {
            const to = sq + offs[i];
            if (to & 0x88) continue;
            const tg = B[to];
            if (!tg) { if (!caps) add(sq, to, 0); } else if ((tg >> 3) !== us) add(sq, to, 0);
          }
        } else {
          for (let i = 0; i < 4; i++) {
            if (t !== 4) { const d = DDIR[i]; let to = sq + d;
              while (!(to & 0x88)) { const tg = B[to]; if (!tg) { if (!caps) add(sq, to, 0); } else { if ((tg >> 3) !== us) add(sq, to, 0); break; } to += d; } }
            if (t !== 3) { const d = ODIR[i]; let to = sq + d;
              while (!(to & 0x88)) { const tg = B[to]; if (!tg) { if (!caps) add(sq, to, 0); } else { if ((tg >> 3) !== us) add(sq, to, 0); break; } to += d; } }
          }
        }
      }
    }
    if (!caps) {
      const home = us === 0 ? 0x74 : 0x04;
      if (kingSq[us] === home && (castle & (us === 0 ? 3 : 12)) && !atacada(home, opp)) {
        const torre = (us << 3) | 4;
        if ((castle & (us === 0 ? 1 : 4)) && !B[home + 1] && !B[home + 2] && B[home + 3] === torre &&
            !atacada(home + 1, opp) && !atacada(home + 2, opp)) add(home, home + 2, 3 << 17);
        if ((castle & (us === 0 ? 2 : 8)) && !B[home - 1] && !B[home - 2] && !B[home - 3] && B[home - 4] === torre &&
            !atacada(home - 1, opp) && !atacada(home - 2, opp)) add(home, home - 2, 4 << 17);
      }
    }
    return gn;
  }

  /* --- Fazer / desfazer --- */
  function make(m) {
    const from = m & 127, to = (m >> 7) & 127, pr = (m >> 14) & 7, fl = (m >> 17) & 7;
    const p = B[from], us = side;
    let cap = B[to];
    uMove[sp] = m; uCastle[sp] = castle; uEp[sp] = ep; uHalf[sp] = half; uLo[sp] = hlo; uHi[sp] = hhi;
    if (ep >= 0) { hlo ^= EL[ep & 7]; hhi ^= EH[ep & 7]; }
    hlo ^= CL[castle]; hhi ^= CH[castle];
    hlo ^= ZL[p * 128 + from]; hhi ^= ZH[p * 128 + from];
    B[from] = 0;
    if (cap) { hlo ^= ZL[cap * 128 + to]; hhi ^= ZH[cap * 128 + to]; npm[cap >> 3] -= NV[cap & 7]; }
    if (fl === 2) {
      const cs = to + (us === 0 ? 16 : -16);
      cap = B[cs]; B[cs] = 0;
      hlo ^= ZL[cap * 128 + cs]; hhi ^= ZH[cap * 128 + cs];
    }
    uCap[sp] = cap;
    const np = pr ? ((us << 3) | pr) : p;
    if (pr) npm[us] += NV[pr];
    B[to] = np; hlo ^= ZL[np * 128 + to]; hhi ^= ZH[np * 128 + to];
    if (fl === 3 || fl === 4) {
      const torre = (us << 3) | 4;
      const rf = fl === 3 ? to + 1 : to - 2, rt = fl === 3 ? to - 1 : to + 1;
      B[rf] = 0; B[rt] = torre;
      hlo ^= ZL[torre * 128 + rf] ^ ZL[torre * 128 + rt]; hhi ^= ZH[torre * 128 + rf] ^ ZH[torre * 128 + rt];
    }
    if ((p & 7) === 6) kingSq[us] = to;
    castle &= CR[from] & CR[to];
    ep = fl === 1 ? (from + to) >> 1 : -1;
    half = ((p & 7) === 1 || cap) ? 0 : half + 1;
    hlo ^= CL[castle]; hhi ^= CH[castle];
    if (ep >= 0) { hlo ^= EL[ep & 7]; hhi ^= EH[ep & 7]; }
    side ^= 1; hlo ^= SL; hhi ^= SH;
    sp++;
    seenLo[seenN] = hlo; seenHi[seenN] = hhi; seenN++;
  }
  function unmake() {
    seenN--; sp--;
    const m = uMove[sp], from = m & 127, to = (m >> 7) & 127, pr = (m >> 14) & 7, fl = (m >> 17) & 7;
    side ^= 1;
    const us = side, cap = uCap[sp];
    let p = B[to];
    if (pr) { npm[us] -= NV[pr]; p = (us << 3) | 1; }
    B[from] = p;
    if (fl === 2) { B[to] = 0; B[to + (us === 0 ? 16 : -16)] = cap; npm[cap >> 3] += NV[cap & 7]; }
    else { B[to] = cap; if (cap) npm[cap >> 3] += NV[cap & 7]; }
    if (fl === 3) { B[to - 1] = 0; B[to + 1] = (us << 3) | 4; }
    else if (fl === 4) { B[to + 1] = 0; B[to - 2] = (us << 3) | 4; }
    if ((p & 7) === 6) kingSq[us] = from;
    castle = uCastle[sp]; ep = uEp[sp]; half = uHalf[sp]; hlo = uLo[sp]; hhi = uHi[sp];
  }

  /* --- Avaliação (positivo = bom para quem joga) --- */
  const pc = new Int8Array(16), wMax = new Int8Array(8), bMin = new Int8Array(8);
  const lp = new Int32Array(16), lr = new Int32Array(8);
  function evaluar() {
    pc.fill(0); wMax.fill(-1); bMin.fill(8);
    let sc = 0, ph = 0, np = 0, nr = 0, minor = 0, outras = 0;
    let bispoB = 0, bispoP = 0;
    const ua = [0, 0], zona = [kingSq[1], kingSq[0]]; // zona = rei adversário de cada cor
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = (r << 4) | c, p = B[sq];
        if (!p) continue;
        const col = p >> 3, t = p & 7, sg = col === 0 ? 1 : -1;
        const idx = col === 0 ? r * 8 + c : (7 - r) * 8 + c;
        if (t === 1) {
          sc += sg * (100 + PST[1][idx]);
          lp[np++] = sq; pc[col * 8 + c]++;
          if (col === 0) { if (r > wMax[c]) wMax[c] = r; } else if (r < bMin[c]) bMin[c] = r;
        } else if (t === 6) {
          continue;
        } else {
          sc += sg * (VAL[t] + PST[t][idx]);
          const ek = zona[col], er = ek >> 4, ec = ek & 7;
          let mob = 0, cen = 0, atk = 0;
          if (t === 2) {
            ph += 1; minor++;
            for (let i = 0; i < 8; i++) {
              const s = sq + NOFF[i];
              if (s & 0x88) continue;
              const tg = B[s];
              if (!tg || (tg >> 3) !== col) {
                mob++;
                const sr = s >> 4, sc2 = s & 7;
                if (sr >= 3 && sr <= 4 && sc2 >= 3 && sc2 <= 4) cen++;
                if (sr - er <= 1 && er - sr <= 1 && sc2 - ec <= 1 && ec - sc2 <= 1) atk = 1;
              }
            }
            sc += sg * ((mob - 4) * 4 + cen * 3);
            ua[col] += atk * 2;
          } else {
            if (t === 3) { ph += 1; minor++; if (col === 0) bispoB++; else bispoP++; }
            else if (t === 4) { ph += 2; outras++; lr[nr++] = sq; }
            else { ph += 4; outras++; }
            for (let i = 0; i < 4; i++) {
              for (let k = 0; k < 2; k++) {
                if ((t === 4 && k === 0) || (t === 3 && k === 1)) continue;
                const d = k === 0 ? DDIR[i] : ODIR[i];
                let s = sq + d;
                while (!(s & 0x88)) {
                  const tg = B[s];
                  if (!tg || (tg >> 3) !== col) {
                    mob++;
                    const sr = s >> 4, sc2 = s & 7;
                    if (sr >= 3 && sr <= 4 && sc2 >= 3 && sc2 <= 4) cen++;
                    if (sr - er <= 1 && er - sr <= 1 && sc2 - ec <= 1 && ec - sc2 <= 1) atk = 1;
                  }
                  if (tg) break;
                  s += d;
                }
              }
            }
            if (t === 3) sc += sg * ((mob - 6) * 3 + cen * 2);
            else if (t === 4) sc += sg * ((mob - 7) * 2 + cen);
            else sc += sg * ((mob - 13) + cen);
            ua[col] += atk * (t === 3 ? 2 : t === 4 ? 3 : 5);
          }
        }
      }
    }
    if (np === 0 && outras === 0 && minor <= 1) return 0; // material insuficiente
    const mgW = ph > 20 ? 20 : ph, egW = 20 - mgW;
    // reis: PST misturada (meio-jogo x final)
    for (let col = 0; col < 2; col++) {
      const ks = kingSq[col], kr = ks >> 4, kc = ks & 7, sg = col === 0 ? 1 : -1;
      const idx = col === 0 ? kr * 8 + kc : (7 - kr) * 8 + kc;
      sc += sg * ((KMG[idx] * mgW + KEG[idx] * egW) / 20) | 0;
      // escudo de peões e ataque à zona do rei (só conta no meio-jogo)
      let escudo = 0;
      const fd = col === 0 ? -1 : 1, pp = (col << 3) | 1;
      for (let f = kc - 1; f <= kc + 1; f++) {
        if (f < 0 || f > 7) continue;
        const r1 = kr + fd, r2 = kr + 2 * fd;
        if (r1 >= 0 && r1 <= 7 && B[(r1 << 4) | f] === pp) escudo += 12;
        else if (r2 >= 0 && r2 <= 7 && B[(r2 << 4) | f] === pp) escudo += 6;
        else escudo -= 10;
        if (pc[col * 8 + f] === 0) escudo -= (pc[(col ^ 1) * 8 + f] === 0 ? 14 : 8); // coluna aberta junto ao rei
      }
      sc += sg * ((escudo * mgW / 20) | 0);
      const un = ua[col ^ 1] > 11 ? 11 : ua[col ^ 1];
      sc -= sg * ((ATAQUE_REI[un] * mgW / 20) | 0);
    }
    if (bispoB >= 2) sc += 30;
    if (bispoP >= 2) sc -= 30;
    // estrutura de peões
    for (let i = 0; i < np; i++) {
      const sq = lp[i], r = sq >> 4, c = sq & 7, col = B[sq] >> 3, sg = col === 0 ? 1 : -1;
      if (pc[col * 8 + c] > 1) sc -= sg * 8;
      if ((c === 0 ? 0 : pc[col * 8 + c - 1]) + (c === 7 ? 0 : pc[col * 8 + c + 1]) === 0) sc -= sg * 12;
      let livre = true;
      for (let f = c - 1; f <= c + 1 && livre; f++) {
        if (f < 0 || f > 7) continue;
        if (col === 0 ? bMin[f] < r : wMax[f] > r) livre = false;
      }
      if (livre) {
        const av = col === 0 ? 6 - r : r - 1;
        sc += sg * ((PASSADO[av > 0 ? av : 0] * (20 + egW) / 20) | 0);
      }
    }
    for (let i = 0; i < nr; i++) {
      const sq = lr[i], c = sq & 7, col = B[sq] >> 3, sg = col === 0 ? 1 : -1;
      if (pc[col * 8 + c] === 0) sc += sg * (pc[(col ^ 1) * 8 + c] === 0 ? 20 : 10);
    }
    // final: o lado melhor encurrala o rei adversário
    if (egW > 6 && (sc > 150 || sc < -150)) {
      const gan = sc > 0 ? 0 : 1, per = gan ^ 1;
      const pr = kingSq[per] >> 4, pcn = kingSq[per] & 7, gr = kingSq[gan] >> 4, gc = kingSq[gan] & 7;
      const dc = Math.max(3 - pr, pr - 4) + Math.max(3 - pcn, pcn - 4);
      const dist = Math.abs(pr - gr) + Math.abs(pcn - gc);
      const b = ((dc * 12 + (14 - dist) * 5) * egW / 20) | 0;
      sc += gan === 0 ? b : -b;
    }
    let v = side === 0 ? sc : -sc;
    v += 8;
    if (atacada(kingSq[side], side ^ 1)) v -= 20; // quem está em xeque sofre; dar xeque vale ponto
    return v;
  }

  /* --- Busca --- */
  function checarTempo() { if ((nos & 1023) === 0 && Date.now() > prazo) parar = true; }

  function quies(alpha, beta, ply, qd) {
    nos++; checarTempo();
    if (parar) return 0;
    const stand = evaluar();
    if (ply >= MAXP - 2 || qd >= qLim) return stand;
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const base = ply * 256;
    const n = gen(base, true, ply, 0);
    for (let i = 0; i < n; i++) {
      let bi = i, bs = SC[base + i];
      for (let j = i + 1; j < n; j++) if (SC[base + j] > bs) { bs = SC[base + j]; bi = j; }
      if (bi !== i) { const tm = MV[base + i]; MV[base + i] = MV[base + bi]; MV[base + bi] = tm; SC[base + bi] = SC[base + i]; SC[base + i] = bs; }
      const m = MV[base + i];
      const alvo = B[(m >> 7) & 127];
      if (!((m >> 14) & 7) && stand + VAL[alvo & 7] + 200 < alpha) continue;
      make(m);
      if (atacada(kingSq[side ^ 1], side)) { unmake(); continue; }
      const sc = -quies(-beta, -alpha, ply + 1, qd + 1);
      unmake();
      if (parar) return 0;
      if (sc > alpha) { alpha = sc; if (sc >= beta) return sc; }
    }
    return alpha;
  }

  function negamax(depth, alpha, beta, ply, podeNulo) {
    nos++; checarTempo();
    if (parar) return 0;
    if (ply > 0) {
      if (half >= 100) return 0;
      const lim = seenN - 1 - half > 0 ? seenN - 1 - half : 0;
      for (let i = seenN - 3; i >= lim; i -= 2) if (seenLo[i] === hlo && seenHi[i] === hhi) return 0;
    }
    if (ply >= MAXP - 4) return evaluar();
    const emXeque = atacada(kingSq[side], side ^ 1);
    if (emXeque) depth++;
    if (depth <= 0) return quies(alpha, beta, ply, 0);

    const alfa0 = alpha;
    const idx = hlo & TTM;
    let ttm = 0;
    if (ttFlag[idx] && ttHi[idx] === hhi) {
      ttm = ttMove[idx];
      if (ply > 0 && ttDepth[idx] >= depth) {
        let s = ttScore[idx];
        if (s > MATE - 200) s -= ply; else if (s < -MATE + 200) s += ply;
        const f = ttFlag[idx];
        if (f === 1) return s;
        if (f === 2 && s > alpha) alpha = s;
        else if (f === 3 && s < beta) beta = s;
        if (alpha >= beta) return s;
      }
    }
    // lance nulo
    if (podeNulo && !emXeque && depth >= 3 && ply > 0 && npm[side] > 0 && beta < MATE - 200 && evaluar() >= beta) {
      const sEp = ep, sLo = hlo, sHi = hhi;
      if (ep >= 0) { hlo ^= EL[ep & 7]; hhi ^= EH[ep & 7]; }
      ep = -1; side ^= 1; hlo ^= SL; hhi ^= SH;
      seenLo[seenN] = hlo; seenHi[seenN] = hhi; seenN++;
      const sc = -negamax(depth - 3 - (depth > 6 ? 1 : 0), -beta, -beta + 1, ply + 1, false);
      seenN--; side ^= 1; ep = sEp; hlo = sLo; hhi = sHi;
      if (parar) return 0;
      if (sc >= beta) return sc >= MATE - 200 ? beta : sc;
    }

    const base = ply * 256;
    const n = gen(base, false, ply, ttm);
    let melhor = -INF, melhorLance = 0, legais = 0;
    for (let i = 0; i < n; i++) {
      let bi = i, bs = SC[base + i];
      for (let j = i + 1; j < n; j++) if (SC[base + j] > bs) { bs = SC[base + j]; bi = j; }
      if (bi !== i) { const tm = MV[base + i]; MV[base + i] = MV[base + bi]; MV[base + bi] = tm; SC[base + bi] = SC[base + i]; SC[base + i] = bs; }
      const m = MV[base + i];
      make(m);
      if (atacada(kingSq[side ^ 1], side)) { unmake(); continue; }
      legais++;
      const quieto = !uCap[sp - 1] && !((m >> 14) & 7);
      let sc;
      if (legais === 1) sc = -negamax(depth - 1, -beta, -alpha, ply + 1, true);
      else {
        let red = 0;
        if (depth >= 3 && legais > 4 && quieto && !emXeque) red = legais > 10 ? 2 : 1;
        sc = -negamax(depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
        if (sc > alpha && red) sc = -negamax(depth - 1, -alpha - 1, -alpha, ply + 1, true);
        if (sc > alpha && sc < beta) sc = -negamax(depth - 1, -beta, -alpha, ply + 1, true);
      }
      unmake();
      if (parar) return 0;
      if (sc > melhor) {
        melhor = sc; melhorLance = m;
        if (sc > alpha) {
          alpha = sc;
          if (sc >= beta) {
            if (quieto) {
              if (K1[ply] !== m) { K2[ply] = K1[ply]; K1[ply] = m; }
              const hi = (m & 127) * 128 + ((m >> 7) & 127);
              H[hi] += depth * depth;
              if (H[hi] > 70000) for (let k = 0; k < H.length; k++) H[k] >>= 1;
            }
            break;
          }
        }
      }
    }
    if (legais === 0) return emXeque ? -MATE + ply : 0;
    const flag = melhor >= beta ? 2 : melhor > alfa0 ? 1 : 3;
    if (!ttFlag[idx] || ttAge[idx] !== idade || ttDepth[idx] <= depth || ttHi[idx] !== hhi) {
      let s = melhor;
      if (s > MATE - 200) s += ply; else if (s < -MATE + 200) s -= ply;
      ttHi[idx] = hhi; ttMove[idx] = melhorLance; ttScore[idx] = s; ttDepth[idx] = depth > 100 ? 100 : depth; ttFlag[idx] = flag; ttAge[idx] = idade;
    }
    return melhor;
  }

  /* --- Carregar posição --- */
  const TIPO = { P: 1, N: 2, B: 3, R: 4, Q: 5, K: 6 };
  function hashPos(bd, sd, cs, e) {
    let lo = 0, hi = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) continue;
      const p = bd[sq];
      if (p) { lo ^= ZL[p * 128 + sq]; hi ^= ZH[p * 128 + sq]; }
    }
    if (sd) { lo ^= SL; hi ^= SH; }
    lo ^= CL[cs]; hi ^= CH[cs];
    if (e >= 0) { lo ^= EL[e & 7]; hi ^= EH[e & 7]; }
    return [lo, hi];
  }
  function hashDeChave(s) {
    const bd = new Int8Array(128);
    let i = 0;
    for (let k = 0; k < 64; k++) {
      const sq = ((k >> 3) << 4) | (k & 7);
      if (s[i] === '.') i++;
      else { bd[sq] = (s[i] === 'b' ? 8 : 0) | TIPO[s[i + 1]]; i += 2; }
    }
    const sd = s[i++] === 'b' ? 1 : 0;
    let cs = 0;
    const M = { K: 1, Q: 2, k: 4, q: 8 };
    while (i < s.length && M[s[i]]) cs |= M[s[i++]];
    const e = s[i] === '-' || i >= s.length ? -1 : s.charCodeAt(i) - 97;
    return hashPos(bd, sd, cs, e);
  }
  function carregar(pos, hist) {
    B.fill(0); npm[0] = npm[1] = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = pos.board[r][c];
      if (!p) continue;
      const cod = (p[0] === 'b' ? 8 : 0) | TIPO[p[1]], sq = (r << 4) | c;
      B[sq] = cod;
      if ((cod & 7) === 6) kingSq[cod >> 3] = sq;
      npm[cod >> 3] += NV[cod & 7];
    }
    side = pos.currentTurn === 'b' ? 1 : 0;
    const d = pos.castlingRights;
    castle = (d.wK ? 1 : 0) | (d.wQ ? 2 : 0) | (d.bK ? 4 : 0) | (d.bQ ? 8 : 0);
    ep = pos.enPassantTarget ? (pos.enPassantTarget[0] << 4) | pos.enPassantTarget[1] : -1;
    half = pos.halfmoveClock || 0;
    const h = hashPos(B, side, castle, ep);
    hlo = h[0]; hhi = h[1]; sp = 0; seenN = 0;
    // histórico da partida: o último item é a posição atual
    const ini = hist && hist.length > 400 ? hist.length - 400 : 0;
    for (let i = ini; i < (hist ? hist.length : 0) - 1; i++) {
      const hh = hashDeChave(hist[i]);
      seenLo[seenN] = hh[0]; seenHi[seenN] = hh[1]; seenN++;
    }
    seenLo[seenN] = hlo; seenHi[seenN] = hhi; seenN++;
  }

  function lancesRaiz() {
    const out = [];
    const n = gen(0, false, 0, 0);
    const copia = [];
    for (let i = 0; i < n; i++) copia.push([MV[i], SC[i]]);
    for (const [m, s] of copia) {
      make(m);
      if (!atacada(kingSq[side ^ 1], side)) out.push([m, s]);
      unmake();
    }
    out.sort((a, b) => b[1] - a[1]);
    return out.map(x => x[0]);
  }
  function paraLance(m) {
    const from = m & 127, to = (m >> 7) & 127, pr = (m >> 14) & 7;
    const mv = { fr: from >> 4, fc: from & 7, r: to >> 4, c: to & 7 };
    if (pr) mv.promo = 'xxNBRQ'[pr];
    return mv;
  }

  /* --- Níveis --- */
  function escolherMedio(raiz) {
    qLim = 4; parar = false; prazo = Date.now() + 2000;
    const pontos = [];
    let melhor = -INF;
    for (const m of raiz) {
      make(m);
      const sc = -negamax(1, -INF, INF, 1, false);
      unmake();
      pontos.push(sc);
      if (sc > melhor) melhor = sc;
    }
    if (melhor >= MATE - 100) return raiz[pontos.indexOf(melhor)];
    const cand = [];
    for (let i = 0; i < raiz.length; i++) if (pontos[i] >= melhor - 14) cand.push(raiz[i]);
    return cand[Math.floor(Math.random() * cand.length)];
  }

  function escolherDificil(raiz, ms, msMax) {
    qLim = 10; parar = false;
    const t0 = Date.now();
    prazo = t0 + msMax;
    let melhor = raiz[0], profundidade = 0, pontuacao = 0;
    for (let d = 1; d <= 24; d++) {
      let alfa = -INF, achou = 0, itMelhor = 0, itPont = -INF;
      for (let i = 0; i < raiz.length; i++) {
        const m = raiz[i];
        make(m);
        let sc;
        if (i === 0) sc = -negamax(d - 1, -INF, -alfa, 1, true);
        else {
          sc = -negamax(d - 1, -alfa - 1, -alfa, 1, true);
          if (sc > alfa && !parar) sc = -negamax(d - 1, -INF, -alfa, 1, true);
        }
        unmake();
        if (parar) break;
        if (i === 0 || sc > alfa) { alfa = sc; itMelhor = m; itPont = sc; achou = 1; }
      }
      if (achou && (!parar || itMelhor)) {
        if (!parar || itMelhor) { melhor = itMelhor; pontuacao = itPont; profundidade = d; }
      }
      if (parar) break;
      // melhor lance para a frente na próxima iteração
      const k = raiz.indexOf(melhor);
      if (k > 0) { raiz.splice(k, 1); raiz.unshift(melhor); }
      if (Math.abs(pontuacao) >= MATE - 100 && d >= 3) break;
      if (Date.now() - t0 > ms * 0.55) break;
    }
    motor.ultimo = { profundidade, pontuacao, nos, ms: Date.now() - t0 };
    return melhor;
  }

  const motor = {
    ultimo: null,
    reiniciar() {
      ttFlag.fill(0); H.fill(0); K1.fill(0); K2.fill(0); idade = 0;
    },
    // pos: posição serializada; devolve {fr, fc, r, c, promo?}
    escolher(pos, nivel, hist, opcoes) {
      opcoes = opcoes || {};
      carregar(pos, hist);
      idade = (idade + 1) & 255;
      nos = 0;
      for (let i = 0; i < H.length; i++) H[i] >>= 2;
      K1.fill(0); K2.fill(0);
      const raiz = lancesRaiz();
      if (!raiz.length) return null;
      if (raiz.length === 1) return paraLance(raiz[0]);
      let m;
      if (nivel === 'medio') m = escolherMedio(raiz);
      else m = escolherDificil(raiz, opcoes.ms || 1500, opcoes.msMax || 2000);
      return paraLance(m);
    }
  };
  return motor;
}

/* ---------- INTERFACE DO BOT (página) ---------- */
const Bot = {
  config: { msDificil: 1500, msMaximo: 2000, msFallback: 600, usarWorker: true },
  _worker: null,
  _pendente: null,
  _motor: null,
  _geracao: 0,
  _id: 0,
  ultimo: null,

  // Fácil: aleatório, capturas ocasionais, às vezes enxerga um mate em 1
  _facil(pos, legais) {
    if (Math.random() < 0.4) {
      for (const m of legais) {
        const sit = Regras.situacao(Regras.aplicar(pos, m), []);
        if (sit.fim && sit.tipo === 'xequemate') return m;
      }
    }
    if (Math.random() < 0.35) {
      const caps = legais.filter(m => Regras.casaCapturada(pos, m));
      if (caps.length) return caps[Math.floor(Math.random() * caps.length)];
    }
    return legais[Math.floor(Math.random() * legais.length)];
  },

  _motorLocal() {
    if (!this._motor) this._motor = criarMotor();
    return this._motor;
  },

  _criarWorker() {
    if (this._worker) return this._worker;
    if (!this.config.usarWorker || typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') return null;
    try {
      const fonte = `const motor = (${criarMotor.toString()})();
self.onmessage = function (e) {
  const d = e.data;
  if (d.t === 'reset') { motor.reiniciar(); return; }
  let mv = null, erro = null;
  try { mv = motor.escolher(d.pos, d.nivel, d.hist, d.opc); } catch (x) { erro = String(x && x.message || x); }
  self.postMessage({ id: d.id, mv: mv, erro: erro, info: motor.ultimo });
};`;
      const url = URL.createObjectURL(new Blob([fonte], { type: 'text/javascript' }));
      const w = new Worker(url);
      URL.revokeObjectURL(url);
      w.onmessage = e => {
        const p = this._pendente;
        if (p && p.id === e.data.id) {
          this._pendente = null;
          clearTimeout(p.timer);
          if (e.data.info) this.ultimo = e.data.info;
          p.resolve(e.data.erro ? null : e.data.mv);
        }
      };
      w.onerror = () => this._falhaWorker();
      this._worker = w;
    } catch (e) {
      this._worker = null;
      this.config.usarWorker = false;
    }
    return this._worker;
  },

  _falhaWorker() {
    this.config.usarWorker = false;
    if (this._worker) { try { this._worker.terminate(); } catch (e) { /* ignora */ } }
    this._worker = null;
    const p = this._pendente;
    this._pendente = null;
    if (p) { clearTimeout(p.timer); p.resolve(undefined); } // undefined = use o fallback
  },

  // Roda a busca (Worker se possível; senão na própria página, com tempo reduzido)
  async _buscar(pos, nivel, hist) {
    const simples = {
      board: pos.board, currentTurn: pos.currentTurn, castlingRights: pos.castlingRights,
      enPassantTarget: pos.enPassantTarget, halfmoveClock: pos.halfmoveClock
    };
    const opc = { ms: this.config.msDificil, msMax: this.config.msMaximo };
    const w = this._criarWorker();
    if (w) {
      const id = ++this._id;
      const r = await new Promise(resolve => {
        const timer = setTimeout(() => { if (this._pendente && this._pendente.id === id) this._falhaWorker(); }, this.config.msMaximo + 4000);
        this._pendente = { id, resolve, timer };
        try { w.postMessage({ id, pos: simples, nivel, hist, opc }); } catch (e) { this._falhaWorker(); }
      });
      if (r !== undefined) return r;
    }
    // fallback: síncrono, com tempo menor para não congelar demais
    await esperar(20);
    const m = this._motorLocal();
    const o = nivel === 'dificil' && this.config.usarWorker === false && typeof window !== 'undefined'
      ? { ms: this.config.msFallback, msMax: this.config.msFallback + 300 } : opc;
    const mv = m.escolher(simples, nivel, hist, o);
    this.ultimo = m.ultimo;
    return mv;
  },

  async escolher(pos, nivel, historico) {
    const gen = this._geracao;
    const legais = Regras.todosLegais(pos);
    if (legais.length <= 1) return legais[0] || null;
    if (nivel === 'facil') {
      await esperar(0);
      return this._facil(pos, legais);
    }
    let achado = null;
    try {
      const mv = await this._buscar(pos, nivel === 'medio' ? 'medio' : 'dificil', historico || []);
      if (mv) achado = legais.find(m => m.fr === mv.fr && m.fc === mv.fc && m.r === mv.r && m.c === mv.c && (m.promo || null) === (mv.promo || null));
    } catch (e) {
      console.error('Bot: busca falhou', e);
    }
    if (!achado) {
      if (gen === this._geracao) this.erros = (this.erros || 0) + 1;
      achado = legais[Math.floor(Math.random() * legais.length)];
    }
    return achado;
  },

  // Limpa tabela de transposição, killers e worker (cancela busca em andamento)
  reiniciar() {
    this._geracao++;
    const p = this._pendente;
    this._pendente = null;
    if (p) { clearTimeout(p.timer); p.resolve(null); }
    if (this._worker) { try { this._worker.terminate(); } catch (e) { /* ignora */ } }
    this._worker = null;
    if (this._motor) this._motor.reiniciar();
  }
};

/* ============================================================
   PARTIDA
   ============================================================ */
/* Estado central da partida, turnos, capturas, pontuação, xeque, xeque-mate e vez do bot. */

// Configuração escolhida antes da partida (mantida para "Jogar novamente").
// gameMode: 'duelo' | 'bot' | 'online'. corLocal: cor de quem joga neste dispositivo no Multiplayer.
const CONFIG = { gameMode: 'duelo', botDifficulty: 'facil', nome: '', intro: true, corHumano: 'w', corBot: 'b', corLocal: 'w' };

let S = null;          // estado da partida atual
let partidaAtual = 0;  // muda a cada nova partida; lances/bot de partidas antigas são descartados

function novoEstado() {
  partidaAtual++;
  const pos = Regras.inicial();
  return {
    id: partidaAtual,
    ...pos,                                   // board, currentTurn, castlingRights, enPassantTarget, kings...
    gameMode: CONFIG.gameMode,                // 'duelo' | 'bot'
    botDifficulty: CONFIG.gameMode === 'bot' ? CONFIG.botDifficulty : null,
    nome: CONFIG.nome,
    capturedWhitePieces: [],                  // peças brancas capturadas (pelo Reino Negro)
    capturedBlackPieces: [],                  // peças pretas capturadas (pelo Reino Branco)
    pontos: { w: 0, b: 0 },
    gameStatus: 'jogando',                    // 'jogando' | 'xeque' | 'xequemate' | 'empate'
    resultado: null,
    historico: [Regras.chave(pos)],
    log: [],
    sel: null, lances: [], ultimo: null, xeque: null,
    ocupado: false,                           // animação em andamento: nenhuma outra jogada
    botPensando: false,
    msg: '', msgTipo: ''
  };
}

// Avisa o ambiente (luz, partículas) e quem mais escutar o evento 'xadrez' (ex.: easter eggs).
function notificar(evento, dados = {}) {
  Ambiente.reagir(evento, dados);
  window.dispatchEvent(new CustomEvent('xadrez', { detail: { evento, ...dados } }));
}

const partidaValida = id => S && S.id === id && partidaAtual === id;
const fimDeJogo = () => !S || S.gameStatus === 'xequemate' || S.gameStatus === 'empate';
const vezDoBot = () => S && S.gameMode === 'bot' && S.currentTurn === CONFIG.corBot;
const vezDoRemoto = () => S && S.gameMode === 'online' && S.currentTurn !== CONFIG.corLocal;

function nomeDoLado(cor) {
  if (S.gameMode === 'bot') return cor === CONFIG.corHumano ? (S.nome || 'Você') : `Bot ${NOME_NIVEL[S.botDifficulty]}`;
  if (S.gameMode === 'online') return cor === CONFIG.corLocal ? (S.nome || 'Você') : (Rede.nomeRemoto() || 'Adversário');
  return cor === 'w' ? 'Brancas' : 'Pretas';
}

function iniciarPartida() {
  Bot.reiniciar();
  S = novoEstado();
  // no Multiplayer as peças de quem joga neste dispositivo ficam sempre embaixo
  const inverter = S.gameMode === 'online' && CONFIG.corLocal === 'b';
  Tabuleiro.orientar(inverter);
  $('tela-jogo').classList.toggle('invertido', inverter);
  Tabuleiro.desenhar(S);
  atualizarPainel();
  notificar('inicio', { cor: 'w' });
}

function encerrarPartida() {
  partidaAtual++;
  if (S) S.botPensando = false;
}

/* ---------- MOVIMENTAÇÃO: entrada do jogador ---------- */
function aoClicarCasa(r, c) {
  if (!S || S.ocupado || S.botPensando || fimDeJogo() || vezDoBot() || Dialogo.aberto()) return;
  if (vezDoRemoto()) {
    definirMsg(`Aguarde: é a vez de ${nomeDoLado(S.currentTurn)}.`, 'erro');
    Sons.tocar('invalido');
    return;
  }
  const p = S.board[r][c];
  const alvo = S.sel && S.lances.find(m => m.r === r && m.c === c);
  if (alvo) { executarLance(alvo); return; }

  if (p && p[0] === S.currentTurn) {
    if (S.sel && S.sel[0] === r && S.sel[1] === c) { limparSelecao(); Sons.tocar('soltar'); return; }
    S.sel = [r, c];
    // lances de promoção chegam em 4 variantes; para destacar casas basta uma
    S.lances = Regras.legais(S, r, c).filter(m => !m.promo || m.promo === 'Q');
    if (S.lances.length) definirMsg(`${NOME_PECA[p[1]]} — ${LEMA_PECA[p[1]]}`, 'info');
    else definirMsg('Essa peça não tem jogadas legais agora.', 'erro');
    Sons.tocar(S.lances.length ? 'selecionar' : 'invalido');
  } else if (S.sel) {
    definirMsg('Jogada inválida para essa peça.', 'erro');
    Sons.tocar('invalido');
    S.sel = null; S.lances = [];
  } else if (p) {
    definirMsg(`Agora é a vez do ${NOME_REINO[S.currentTurn]}.`, 'erro');
    Sons.tocar('invalido');
  }
  Tabuleiro.desenhar(S);
}

function limparSelecao() {
  S.sel = null; S.lances = [];
  definirMsg(S.xeque ? 'Xeque! Proteja o seu rei.' : '', S.xeque ? 'alerta' : '');
  Tabuleiro.desenhar(S);
}

async function escolherPromocao(cor) {
  const valor = await Dialogo.abrir({
    titulo: 'Promoção do peão',
    corpo: '<p>Seu soldado alcançou as muralhas inimigas! Escolha em quem ele se transforma:</p>',
    cancelavel: false,
    classe: 'promocao',
    botoes: ['Q', 'R', 'B', 'N'].map(t => ({
      valor: t, rotulo: NOME_PECA[t],
      html: `<span class="promo-peca">${Pecas.svg(t, cor)}</span><span>${NOME_PECA[t]}</span>`
    }))
  });
  return valor || 'Q';
}

/* ---------- MOVIMENTAÇÃO + CAPTURAS + TURNOS ---------- */
async function executarLance(mv) {
  const id = S.id;
  const peca = S.board[mv.fr][mv.fc], cor = peca[0];
  const casaCap = Regras.casaCapturada(S, mv);
  const capturada = casaCap ? S.board[casaCap[0]][casaCap[1]] : null;

  S.ocupado = true;
  S.sel = null; S.lances = [];
  Tabuleiro.desenhar(S);

  await Tabuleiro.animarLance(S, mv);
  if (!partidaValida(id)) return;

  // promoção: o humano escolhe; o bot e o adversário remoto já trazem a escolha no lance
  if (peca[1] === 'P' && (mv.r === 0 || mv.r === 7)) {
    mv = { ...mv, promo: mv.promo && (vezDoBot() || vezDoRemoto()) ? mv.promo : await escolherPromocao(cor) };
    if (!partidaValida(id)) return;
  }
  // Multiplayer: o lance do jogador local vai para o adversário
  if (S.gameMode === 'online' && cor === CONFIG.corLocal) Rede.enviarLance(mv);

  const nova = Regras.aplicar(S, mv);
  Object.assign(S, nova);

  if (capturada) {
    (capturada[0] === 'w' ? S.capturedWhitePieces : S.capturedBlackPieces).push(capturada[1]);
    S.pontos[cor] += VALOR_PECA[capturada[1]];
  }
  S.historico.push(Regras.chave(S));
  S.ultimo = [[mv.fr, mv.fc], [mv.r, mv.c]];
  S.log.push(descreverLance(peca, mv, capturada));

  if (mv.f === 'ck' || mv.f === 'cq') { Sons.tocar('roque'); notificar('roque', { cor, mv }); }
  else if (capturada) { Sons.tocar('captura'); notificar('captura', { cor, peca: capturada, casa: casaCap, mv }); }
  else Sons.tocar('mover');
  if (mv.promo) { Sons.tocar('promocao'); notificar('promocao', { cor, casa: [mv.r, mv.c], peca: mv.promo }); }

  S.ocupado = false;
  avaliarPosicao();
}

function descreverLance(peca, mv, capturada) {
  const n = NOME_PECA[peca[1]];
  if (mv.f === 'ck') return `${NOME_REINO[peca[0]]}: roque curto`;
  if (mv.f === 'cq') return `${NOME_REINO[peca[0]]}: roque longo`;
  let t = `${n} ${nomeCasa(mv.fr, mv.fc)} → ${nomeCasa(mv.r, mv.c)}`;
  if (capturada) t += ` captura ${NOME_PECA[capturada[1]]}` + (mv.f === 'ep' ? ' (en passant)' : '');
  if (mv.promo) t += `, promovido a ${NOME_PECA[mv.promo]}`;
  return t;
}

/* ---------- XEQUE + XEQUE-MATE + EMPATE ---------- */
function avaliarPosicao() {
  const sit = Regras.situacao(S, S.historico);
  const cor = S.currentTurn;
  const tinhaXeque = !!S.xeque;
  S.xeque = sit.xeque ? Regras.posRei(S, cor).slice() : null;

  if (sit.fim) {
    S.gameStatus = sit.tipo === 'xequemate' ? 'xequemate' : 'empate';
    S.resultado = sit;
    S.log.push(sit.texto);
    definirMsg(sit.texto, sit.tipo === 'xequemate' ? 'alerta' : 'info');
    Tabuleiro.desenhar(S);
    atualizarPainel();
    finalizarPartida();
    return;
  }

  S.gameStatus = sit.xeque ? 'xeque' : 'jogando';
  if (sit.xeque) {
    Sons.tocar('xeque');
    notificar('xeque', { cor, casa: S.xeque });
    definirMsg(vezDoBot() || vezDoRemoto() || S.gameMode === 'duelo'
      ? `Xeque! O rei do ${NOME_REINO[cor]} está sob ataque.`
      : 'Xeque! Proteja o seu rei.', 'alerta');
  } else {
    if (tinhaXeque) notificar('fim-xeque', { cor });
    definirMsg('', '');
  }
  Tabuleiro.desenhar(S);
  atualizarPainel();
  notificar('lance', { cor });

  if (vezDoBot()) jogarBot();
}

/* ---------- BOT: só joga no próprio turno ---------- */
async function jogarBot() {
  const id = S.id;
  if (!vezDoBot() || fimDeJogo() || S.botPensando) return;
  S.botPensando = true;
  const xequeMsg = S.xeque ? 'Xeque! ' : '';
  definirMsg(xequeMsg + MENSAGEM_BOT[S.botDifficulty], 'bot');
  atualizarPainel();

  const inicio = performance.now();
  await esperar(60); // deixa a interface mostrar a mensagem antes do cálculo
  let mv = null;
  try {
    mv = await Bot.escolher(Regras.copiar(S), S.botDifficulty, S.historico.slice());
  } catch (e) {
    console.error('Bot falhou, usando lance aleatório', e);
  }
  if (!partidaValida(id)) return;
  // garantia: o lance precisa ser legal nesta posição
  const legais = Regras.todosLegais(S);
  const valido = mv && legais.find(m => m.fr === mv.fr && m.fc === mv.fc && m.r === mv.r && m.c === mv.c && (m.promo || null) === (mv.promo || null));
  mv = valido || legais[Math.floor(Math.random() * legais.length)];

  const minimo = { facil: 700, medio: 900, dificil: 1000 }[S.botDifficulty];
  const falta = minimo - (performance.now() - inicio);
  if (falta > 0) await esperar(falta);
  if (!partidaValida(id)) return;

  S.botPensando = false;
  await executarLance(mv);
}

/* ---------- RESULTADO ---------- */
async function finalizarPartida() {
  const id = S.id, res = S.resultado;
  if (res.tipo === 'xequemate') {
    Sons.tocar('xequemate');
    notificar('xequemate', { vencedor: res.vencedor, casaRei: Regras.posRei(S, outraCor(res.vencedor)), casaVencedor: Regras.posRei(S, res.vencedor) });
  } else {
    Sons.tocar('empate');
    notificar('empate', {});
  }
  await esperar(movimentoReduzido() ? 900 : 2600);
  if (!partidaValida(id)) return;
  mostrarResultado(res);
}

/* ---------- PONTUAÇÃO e painel ---------- */
function definirMsg(texto, tipo) {
  S.msg = texto; S.msgTipo = tipo;
  const el = $('msg');
  el.textContent = texto;
  el.className = 'msg' + (tipo ? ' msg-' + tipo : '');
}

function atualizarPainel() {
  const cor = S.currentTurn;
  document.body.dataset.turno = cor;
  $('turno').dataset.cor = cor;
  let texto;
  if (fimDeJogo()) texto = 'Batalha encerrada';
  else if (S.gameMode === 'bot') texto = cor === CONFIG.corHumano ? `Sua vez, ${S.nome || 'jogador'}` : (S.botPensando ? 'O inimigo pensa...' : 'Vez do Reino Negro');
  else if (S.gameMode === 'online') texto = cor === CONFIG.corLocal ? `Sua vez, ${S.nome || 'jogador'}` : `Vez de ${nomeDoLado(cor)}`;
  else texto = `Vez do ${NOME_REINO[cor]}`;
  $('turno-texto').textContent = texto;

  $('jogo-titulo').textContent = S.gameMode === 'bot' ? `${S.nome || 'Jogador'} vs Bot ${NOME_NIVEL[S.botDifficulty]}`
    : S.gameMode === 'online' ? `${nomeDoLado('w')} vs ${nomeDoLado('b')}`
    : `Equipe ${S.nome || 'sem nome'}`;
  $('nome-w').textContent = nomeDoLado('w');
  $('nome-b').textContent = nomeDoLado('b');
  $('pontos-w').textContent = S.pontos.w;
  $('pontos-b').textContent = S.pontos.b;
  // cada reino mostra as peças inimigas que capturou
  const lista = (pecas, corPeca) => pecas
    .slice().sort((a, b) => VALOR_PECA[b] - VALOR_PECA[a])
    .map(t => `<span class="trofeu" title="${NOME_PECA[t]} (${VALOR_PECA[t]})">${Pecas.svg(t, corPeca)}</span>`).join('');
  $('cap-w').innerHTML = lista(S.capturedBlackPieces, 'b');
  $('cap-b').innerHTML = lista(S.capturedWhitePieces, 'w');
  $('placar-w').classList.toggle('vez', cor === 'w' && !fimDeJogo());
  $('placar-b').classList.toggle('vez', cor === 'b' && !fimDeJogo());
  $('log').innerHTML = S.log.map(t => `<li>${t}</li>`).join('');
}

/* ============================================================
   NAVEGACAO
   ============================================================ */
/* Telas, transições, preparação da partida, introdução e tela de resultado. */

let telaAtual = 'menu';
let telaAnterior = 'menu';
let filaTelas = Promise.resolve();
let introTimer = null;

// Troca de tela com transição curta (escurecimento + leve zoom, definido no CSS).
// Pedidos feitos durante uma transição entram na fila e acontecem logo em seguida.
function irPara(tela, opcoes) {
  filaTelas = filaTelas.then(() => trocarTela(tela, opcoes));
  return filaTelas;
}

async function trocarTela(tela, { semTransicao = false } = {}) {
  if (tela === telaAtual) return;
  const veu = $('transicao');
  const animar = !semTransicao && !movimentoReduzido();
  Sons.tocar('transicao');
  if (animar) {
    veu.className = 'transicao fechando';
    await esperar(320);
  }
  const de = $('tela-' + telaAtual), para = $('tela-' + tela);
  de.hidden = true; de.classList.remove('ativa');
  para.hidden = false;
  void para.offsetWidth;
  para.classList.add('ativa');
  if (tela !== 'regras' && tela !== 'aprender') telaAnterior = tela;
  telaAtual = tela;
  document.body.dataset.tela = tela;
  if (tela === 'menu') Sons.musica('menu');
  if (tela === 'jogo' || tela === 'intro') Sons.musica('batalha');
  window.dispatchEvent(new CustomEvent('tela', { detail: tela }));
  if (animar) {
    veu.className = 'transicao abrindo';
    await esperar(380);
  }
  veu.className = 'transicao';
  const foco = para.querySelector('h1, h2, [autofocus]');
  if (foco) { foco.setAttribute('tabindex', '-1'); foco.focus({ preventScroll: true }); }
}

/* ---------- Preparar partida (nome + dificuldade) ---------- */
function abrirConfig(modo) {
  CONFIG.gameMode = modo;
  const bot = modo === 'bot', online = modo === 'online', pessoal = bot || online;
  $('config-titulo').textContent = bot ? 'Jogar contra o Bot' : online ? 'Multiplayer' : 'Duelo';
  $('config-rotulo').textContent = pessoal ? 'Nome do jogador' : 'Nome da equipe';
  $('config-nome').placeholder = pessoal ? 'Seu nome, nobre guerreiro' : 'Nome da sua equipe';
  $('config-nome').value = (pessoal ? localStorageLer('xm-jogador') : localStorageLer('xm-equipe')) || '';
  $('config-dificuldade').hidden = !bot;
  $('config-online').hidden = !online;
  atualizarCampoCodigo();
  irPara('config').then(() => $('config-nome').focus());
}

// Multiplayer: o campo do código só aparece para quem vai entrar numa sala
function atualizarCampoCodigo() {
  const entrar = document.querySelector('input[name="sala"]:checked').value === 'entrar';
  $('campo-codigo').hidden = !entrar;
}
$$('input[name="sala"]').forEach(el => el.addEventListener('change', () => {
  atualizarCampoCodigo();
  if (!$('campo-codigo').hidden) $('config-codigo').focus();
}));
$('config-codigo').addEventListener('input', e => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

function localStorageLer(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function localStorageGravar(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } }

$('config-form').addEventListener('submit', e => {
  e.preventDefault();
  const nome = $('config-nome').value.trim();
  if (!nome) { $('config-nome').focus(); return; }
  CONFIG.nome = nome;
  CONFIG.intro = $('config-intro').checked;
  if (CONFIG.gameMode === 'online') {
    localStorageGravar('xm-jogador', nome);
    if (document.querySelector('input[name="sala"]:checked').value === 'criar') Rede.criar();
    else {
      const codigo = $('config-codigo').value.trim();
      if (codigo.length < 5) { $('config-codigo').focus(); aviso('Digite o código de 5 letras da sala.'); return; }
      Rede.entrar(codigo);
    }
    return; // a partida começa quando os dois navegadores se conectarem
  }
  if (CONFIG.gameMode === 'bot') {
    CONFIG.botDifficulty = document.querySelector('input[name="dif"]:checked').value;
    localStorageGravar('xm-jogador', nome);
  } else localStorageGravar('xm-equipe', nome);
  comecarBatalha(CONFIG.intro);
});

async function comecarBatalha(comIntro) {
  encerrarPartida();
  iniciarPartida();
  if (comIntro && !movimentoReduzido()) await tocarIntro();
  else await irPara('jogo');
}

/* ---------- INTRODUÇÃO ---------- */
async function tocarIntro() {
  await irPara('intro');
  Sons.tocar('intro');
  const cena = $('tela-intro');
  cena.classList.remove('fase2');
  void cena.offsetWidth;
  cena.classList.add('rodando');
  clearTimeout(introTimer);
  introTimer = setTimeout(() => cena.classList.add('fase2'), 1500);
  await new Promise(ok => {
    const fim = setTimeout(ok, 3600);
    cena.dataset.pular = '';
    pularIntro = () => { clearTimeout(fim); ok(); };
  });
  clearTimeout(introTimer);
  cena.classList.remove('rodando', 'fase2');
  pularIntro = null;
  await irPara('jogo');
}
let pularIntro = null;

/* ---------- RESULTADO ---------- */
function mostrarResultado(res) {
  const tela = $('tela-resultado');
  let tipo, titulo, simbolo, detalhe;
  if (res.tipo === 'xequemate') {
    const venceu = res.vencedor;
    if (S.gameMode === 'bot') tipo = venceu === CONFIG.corHumano ? 'vitoria' : 'derrota';
    else if (S.gameMode === 'online') tipo = venceu === CONFIG.corLocal ? 'vitoria' : 'derrota';
    else tipo = 'vitoria';
    titulo = `O ${NOME_REINO[venceu]} venceu`;
    simbolo = venceu === 'w' ? '♔' : '♚';
    if (S.gameMode === 'bot') detalhe = tipo === 'vitoria'
      ? `${S.nome}, o rei inimigo caiu! O Bot ${NOME_NIVEL[S.botDifficulty]} se rende.`
      : `O Bot ${NOME_NIVEL[S.botDifficulty]} dominou o campo de batalha. Reúna suas tropas e tente outra vez.`;
    else if (S.gameMode === 'online') detalhe = tipo === 'vitoria'
      ? `${S.nome}, o rei de ${nomeDoLado(outraCor(venceu))} caiu!`
      : `${nomeDoLado(venceu)} dominou o campo de batalha. Reúna suas tropas e peça a revanche.`;
    else detalhe = `Glória à equipe ${S.nome}! O ${NOME_REINO[venceu]} conquistou o tabuleiro.`;
    tela.dataset.reino = venceu;
  } else {
    tipo = 'empate';
    titulo = 'Empate';
    simbolo = '⚖';
    detalhe = res.texto;
    tela.dataset.reino = '';
  }
  tela.dataset.tipo = tipo;
  $('resultado-tipo').textContent = res.tipo === 'xequemate' ? 'Xeque-mate' : 'Trégua entre os reinos';
  $('resultado-titulo').textContent = titulo;
  $('resultado-simbolo').textContent = simbolo;
  $('resultado-detalhe').textContent = `${detalhe} Placar: Branco ${S.pontos.w} × ${S.pontos.b} Negro.`;
  Sons.tocar(tipo === 'derrota' ? 'derrota' : tipo === 'empate' ? 'empate' : 'vitoria');
  irPara('resultado');
}

/* ---------- Ações dos botões (data-acao) ---------- */
const ACOES = {
  'duelo': () => abrirConfig('duelo'),
  'bot': () => abrirConfig('bot'),
  'online': () => abrirConfig('online'),
  'regras': () => irPara('regras'),
  'aprender': () => irPara('aprender'),
  'menu': () => { Rede.sair(); encerrarPartida(); irPara('menu'); },
  'voltar': () => irPara(telaAnterior === 'jogo' && S && !fimDeJogo() ? 'jogo' : 'menu'),
  'pular-intro': () => pularIntro && pularIntro(),
  'jogar-novamente': () => {
    if (CONFIG.gameMode !== 'online') { comecarBatalha(false); return; }
    if (Rede.conectado()) Rede.reiniciar();
    else { aviso('O adversário não está mais conectado.'); irPara('menu'); }
  },
  'reiniciar': async () => {
    const online = S && S.gameMode === 'online';
    const texto = online ? 'Deseja reiniciar a partida? Ela recomeça para os dois jogadores.' : 'Deseja realmente reiniciar a partida?';
    if (!await Dialogo.confirmar('Reiniciar', texto)) return;
    if (online) { Rede.reiniciar(); return; }
    encerrarPartida();
    iniciarPartida();
    Sons.tocar('reiniciar');
  },
  'menu-sair': async () => {
    if (fimDeJogo() || await Dialogo.confirmar('Voltar ao menu', 'Deseja sair da partida e voltar ao menu?')) {
      Rede.sair();
      encerrarPartida();
      irPara('menu');
    }
  }
};

document.addEventListener('click', e => {
  const b = e.target.closest('[data-acao]');
  if (!b || !ACOES[b.dataset.acao]) return;
  Sons.tocar('clique');
  ACOES[b.dataset.acao](b);
});
document.addEventListener('pointerover', e => {
  const b = e.target.closest('button.placa');
  if (b && !b.contains(e.relatedTarget)) Sons.tocar('passar');
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && telaAtual === 'intro' && pularIntro) pularIntro();
});

/* ---------- Controle de áudio ---------- */
(() => {
  const botao = $('audio-mudo'), faixa = $('audio-volume');
  let mudo = localStorageLer('xm-mudo') === '1';
  const vol = localStorageLer('xm-volume');
  if (vol !== null) faixa.value = vol;
  const aplicar = () => {
    Sons.volume(faixa.value / 100);
    Sons.mudo(mudo);
    botao.textContent = mudo || +faixa.value === 0 ? '🔇' : '🔊';
    botao.setAttribute('aria-pressed', String(mudo));
    botao.setAttribute('aria-label', mudo ? 'Ativar som' : 'Silenciar som');
  };
  botao.addEventListener('click', () => { mudo = !mudo; localStorageGravar('xm-mudo', mudo ? '1' : '0'); aplicar(); });
  faixa.addEventListener('input', () => { if (mudo && +faixa.value > 0) mudo = false; localStorageGravar('xm-volume', faixa.value); aplicar(); });
  aplicar();
})();

/* ============================================================
   MULTIPLAYER
   ============================================================ */
/* Partida entre dois navegadores com PeerJS. O servidor público do PeerJS só faz o primeiro
   contato; depois os lances vão direto de um navegador ao outro.
   Quem cria a sala comanda o Reino Branco; quem entra com o código comanda o Reino Negro.
   Mensagens: ola {nome} (convidado -> anfitrião), inicio {nome, rodada} (anfitrião -> convidado),
   lance {fr, fc, r, c, promo, rodada}, reiniciar {rodada}, sair.
   "rodada" muda a cada reinício: lances de uma partida anterior são descartados.
   Todo lance recebido é conferido com Regras.todosLegais antes de ser jogado. */
const Rede = (() => {
  const PREFIXO = 'xadrez-medieval-hackathon-';
  const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O e 1/I, que se confundem
  let peer = null, conn = null, pareado = false, rodada = 0, remoto = '';
  let fila = Promise.resolve(), tempoLimite = 0;

  const codigoNovo = () => Array.from({ length: 5 }, () => ALFABETO[Math.floor(Math.random() * ALFABETO.length)]).join('');
  const limparNome = n => String(n || '').replace(/[<>&"']/g, '').trim().slice(0, 24) || 'Adversário';
  const conectado = () => !!(conn && conn.open && pareado);

  // Desliga tudo. Os ouvintes conferem "p === peer" / "c === conn", então eventos da
  // conexão antiga são ignorados. "atraso" dá tempo para a última mensagem sair.
  function fechar(atraso = 0) {
    clearTimeout(tempoLimite);
    const p = peer, c = conn;
    peer = null; conn = null; pareado = false;
    setTimeout(() => {
      try { if (c) c.close(); } catch (e) { /* já fechada */ }
      try { if (p) p.destroy(); } catch (e) { /* já destruído */ }
    }, atraso);
  }

  function enviar(msg) {
    if (!conn || !conn.open) return;
    try { conn.send(msg); } catch (e) { console.error('Multiplayer: falha ao enviar', e); }
  }

  function falhar(texto) {
    fechar();
    Dialogo.abrir({ titulo: 'Falha na conexão', corpo: `<p>${texto}</p>`, botoes: [{ texto: 'Entendi', valor: true }] });
  }

  function semBiblioteca() {
    if (typeof Peer !== 'undefined') return false;
    falhar('Não foi possível carregar a biblioteca de conexão (PeerJS). Verifique a internet e recarregue a página.');
    return true;
  }

  // janela de espera com botão Cancelar; só "Cancelar" desfaz a sala (não fecha com Esc)
  function esperarDialogo(titulo, corpo, p) {
    Dialogo.abrir({ titulo, corpo, cancelavel: false, botoes: [{ texto: 'Cancelar', valor: 'cancelar', alt: true }] })
      .then(v => { if (v === 'cancelar' && p === peer) fechar(); });
  }

  function erroPeer(p, err) {
    if (p !== peer) return;
    const tipo = err && err.type;
    if (tipo === 'unavailable-id') { criar(); return; } // código já em uso: sorteia outro
    if (pareado) { console.warn('Multiplayer:', err); return; } // a conexão direta segue viva
    const textos = {
      'peer-unavailable': 'Sala não encontrada. Confira o código com quem criou a sala.',
      'network': 'Sem conexão com o servidor de salas. Verifique a internet.',
      'server-error': 'O servidor de salas não respondeu. Tente de novo em instantes.',
      'socket-error': 'O servidor de salas não respondeu. Tente de novo em instantes.',
      'browser-incompatible': 'Este navegador não permite partidas Multiplayer.'
    };
    falhar(textos[tipo] || 'Não foi possível conectar. Tente novamente.');
  }

  function ligar(c) {
    c.on('data', m => { if (c === conn) receber(m); });
    c.on('close', () => { if (c === conn) perdeu('A conexão com o adversário foi perdida.'); });
    c.on('error', err => console.warn('Multiplayer:', err));
  }

  /* ---------- Criar sala (anfitrião, Reino Branco) ---------- */
  function criar() {
    if (semBiblioteca()) return;
    fechar();
    const codigo = codigoNovo();
    const p = peer = new Peer(PREFIXO + codigo);
    esperarDialogo('Abrindo sala', '<p class="sala-espera">Preparando o campo de batalha…</p>', p);
    p.on('error', err => erroPeer(p, err));
    p.on('open', () => {
      if (p !== peer) return;
      esperarDialogo('Sala criada', `<p>Envie este código ao seu adversário:</p>
        <p class="sala-codigo" aria-label="Código da sala: ${codigo.split('').join(' ')}">${codigo}</p>
        <p class="sala-espera">Aguardando o adversário entrar…</p>
        <p class="sala-copiar"><button type="button" class="placa pequena alt" id="sala-copiar">Copiar código</button></p>`, p);
      const botao = $('sala-copiar');
      botao.addEventListener('click', () => {
        const ok = () => { botao.textContent = 'Código copiado!'; };
        if (navigator.clipboard) navigator.clipboard.writeText(codigo).then(ok, () => {});
      });
    });
    p.on('connection', c => {
      if (p !== peer || conn) { c.on('open', () => c.close()); return; } // sala já tem dois jogadores
      conn = c;
      ligar(c);
      // se o convidado não se apresentar, libera a sala para outra tentativa
      setTimeout(() => { if (c === conn && !pareado) { conn = null; try { c.close(); } catch (e) { /* ok */ } } }, 10000);
    });
  }

  /* ---------- Entrar em sala (convidado, Reino Negro) ---------- */
  function entrar(codigo) {
    if (semBiblioteca()) return;
    fechar();
    const p = peer = new Peer();
    esperarDialogo('Entrando na sala', `<p class="sala-espera">Procurando a sala <b>${codigo}</b>…</p>`, p);
    p.on('error', err => erroPeer(p, err));
    p.on('open', () => {
      if (p !== peer) return;
      const c = conn = p.connect(PREFIXO + codigo, { reliable: true });
      ligar(c);
      c.on('open', () => { if (c === conn) enviar({ t: 'ola', nome: CONFIG.nome }); });
    });
    tempoLimite = setTimeout(() => {
      if (p === peer && !pareado) falhar('A sala não respondeu. Confira o código e se o adversário ainda está com a sala aberta.');
    }, 20000);
  }

  /* ---------- Mensagens recebidas ---------- */
  function receber(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'ola' && !pareado) {          // anfitrião: o convidado chegou
      remoto = limparNome(m.nome); rodada = 1; pareado = true;
      enviar({ t: 'inicio', nome: CONFIG.nome, rodada });
      comecar('w');
    } else if (m.t === 'inicio' && !pareado) { // convidado: o anfitrião aceitou
      remoto = limparNome(m.nome); rodada = +m.rodada || 1; pareado = true;
      comecar('b');
    } else if (m.t === 'lance' && pareado) {
      fila = fila.then(() => aplicarRemoto(m)).catch(e => console.error('Multiplayer:', e));
    } else if (m.t === 'reiniciar' && pareado) {
      if (+m.rodada > rodada) {
        rodada = +m.rodada;
        aviso(`<strong>${remoto}</strong> reiniciou a partida.`);
        recomecar();
      }
    } else if (m.t === 'sair') {
      perdeu(`${remoto || 'O adversário'} deixou a batalha.`);
    }
  }

  function comecar(cor) {
    clearTimeout(tempoLimite);
    CONFIG.gameMode = 'online';
    CONFIG.corLocal = cor;
    Dialogo.fechar('ok');
    aviso(`Conectado! Você comanda o <strong>${NOME_REINO[cor]}</strong> contra <strong>${remoto}</strong>.`, 4000);
    comecarBatalha(CONFIG.intro);
  }

  async function aplicarRemoto(m) {
    // espera a partida local existir e terminar a animação em andamento
    for (let i = 0; i < 300 && !(S && S.gameMode === 'online' && !S.ocupado); i++) await esperar(50);
    if (+m.rodada !== rodada || !S || S.gameMode !== 'online' || fimDeJogo() || !vezDoRemoto()) return;
    const mv = Regras.todosLegais(S).find(x => x.fr === m.fr && x.fc === m.fc && x.r === m.r && x.c === m.c && (x.promo || null) === (m.promo || null));
    if (!mv) { console.warn('Multiplayer: lance ilegal recebido e ignorado', m); return; }
    await executarLance(mv);
  }

  function recomecar() {
    if (Dialogo.aberto()) Dialogo.fechar(null);
    comecarBatalha(false);
    Sons.tocar('reiniciar');
  }

  function perdeu(texto) {
    const estavaPareado = pareado;
    fechar();
    if (!estavaPareado) return;
    if (S && S.gameMode === 'online' && !fimDeJogo()) {
      encerrarPartida();
      Dialogo.abrir({ titulo: 'Batalha interrompida', corpo: `<p>${texto}</p>`, cancelavel: false, botoes: [{ texto: 'Voltar ao menu', valor: true }] })
        .then(() => irPara('menu'));
    } else aviso(texto, 4500);
  }

  /* ---------- Interface pública ---------- */
  function enviarLance(mv) {
    enviar({ t: 'lance', fr: mv.fr, fc: mv.fc, r: mv.r, c: mv.c, promo: mv.promo || null, rodada });
  }
  function reiniciar() {
    if (!conectado()) { aviso('O adversário não está mais conectado.'); return; }
    rodada++;
    enviar({ t: 'reiniciar', rodada });
    recomecar();
  }
  function sair() {
    if (!peer && !conn) return;
    enviar({ t: 'sair' });
    fechar(300);
  }
  window.addEventListener('pagehide', () => enviar({ t: 'sair' }));

  return { criar, entrar, enviarLance, reiniciar, sair, conectado, nomeRemoto: () => remoto };
})();

/* ============================================================
   EFEITOS TELAS
   ============================================================ */
/* Efeitos SÓ visuais das telas: cena de batalha do menu, brasas, faíscas da intro e partículas do resultado. */

const EfeitosTelas = (() => {
  const TINTA = '#1b120a';

  // gerador pseudoaleatório determinístico (as duas metades da cena precisam ser idênticas)
  function semente(n) {
    let s = n >>> 0;
    return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  }
  const entre = (r, a, b) => a + r() * (b - a);

  /* ---------- Cena de batalha em iluminura (SVG) ---------- */
  const LARG = 1600, ALT = 900;
  const trac = (w = 3) => `stroke="${TINTA}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

  // pequena torre/castelo distante
  function castelo(x, y, s, tel) {
    const torre = (dx, w, h, t) => `
      <rect x="${dx}" y="${-h}" width="${w}" height="${h}" fill="${t}" ${trac(3)}/>
      <path d="M${dx - 6} ${-h}h${w + 12}v-14h-8v8h-8v-8h-8v8h-8v-8h-8v8h-8v-8h-8v8h-8v-8h-${w - 2}z" fill="${t}" ${trac(3)}/>
      <rect x="${dx + w / 2 - 5}" y="${-h * 0.62}" width="10" height="22" rx="5" fill="${TINTA}"/>`;
    return `<g transform="translate(${x} ${y}) scale(${s})">
      ${torre(-110, 70, 150, tel)}${torre(40, 70, 190, tel)}
      <rect x="-60" y="-100" width="100" height="100" fill="${tel}" ${trac(3)}/>
      <path d="M-130 -150L-75 -230 -20 -150z" fill="#b3312a" ${trac(3)}/>
      <path d="M20 -190L75 -285 130 -190z" fill="#b3312a" ${trac(3)}/>
      <path d="M75 -285v-40" ${trac(3)}/><path d="M75 -325l40 12-40 12z" fill="#d9b45a" ${trac(2)}/>
      <path d="M-20 0v-46a20 20 0 0 1 40 0v46z" fill="${TINTA}"/>
    </g>`;
  }

  function camadaCeu() {
    const r = semente(11);
    let m = `<defs>
      <pattern id="ceu-losango" width="80" height="80" patternUnits="userSpaceOnUse">
        <rect width="80" height="80" fill="#2f4a8c"/>
        <path d="M40 0L80 40 40 80 0 40z" fill="#3a5aa6" stroke="#d9b45a" stroke-width="2.5"/>
        <path d="M40 18L62 40 40 62 18 40z" fill="none" stroke="#b3312a" stroke-width="3"/>
        <circle cx="40" cy="40" r="5" fill="#d9b45a"/><circle cx="0" cy="0" r="4" fill="#d9b45a"/><circle cx="80" cy="0" r="4" fill="#d9b45a"/><circle cx="0" cy="80" r="4" fill="#d9b45a"/><circle cx="80" cy="80" r="4" fill="#d9b45a"/>
      </pattern>
      <linearGradient id="ceu-brilho" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset=".6" stop-color="#000" stop-opacity="0"/></linearGradient>
    </defs>
    <rect width="${LARG}" height="${ALT}" fill="#e0b25a"/>
    <rect y="0" width="${LARG}" height="620" fill="url(#ceu-losango)"/>
    <rect y="0" width="${LARG}" height="620" fill="url(#ceu-brilho)"/>
    <rect y="0" width="${LARG}" height="46" fill="#d77a35" ${trac(3)}/>
    <rect y="46" width="${LARG}" height="9" fill="#d9b45a" ${trac(3)}/>`;
    // colinas distantes (periódicas)
    m += `<path d="M0 560C120 560 180 470 330 480S560 560 700 540 940 450 1100 470 1380 560 1480 540 1560 560 1600 560V900H0z" fill="#8aa56a" ${trac(3)}/>`;
    m += castelo(260, 500, 0.8, '#d8cfb4') + castelo(1130, 485, 0.95, '#cfc6a8');
    m += `<path d="M0 640C160 600 300 560 470 600S760 680 960 620 1300 560 1460 610 1560 640 1600 640V900H0z" fill="#6d8f3e" ${trac(3)}/>`;
    // pequenas árvores em estilo manuscrito
    for (let i = 0; i < 7; i++) {
      const x = 80 + i * 230 + entre(r, -30, 30), y = 640 + entre(r, -10, 20);
      m += `<g transform="translate(${x} ${y})"><path d="M0 0v-40" ${trac(4)}/><circle cx="0" cy="-60" r="26" fill="#4d6a2a" ${trac(3)}/><circle cx="-16" cy="-44" r="16" fill="#5d7c34" ${trac(2.5)}/><circle cx="16" cy="-48" r="16" fill="#5d7c34" ${trac(2.5)}/></g>`;
    }
    return m;
  }

  // soldado de infantaria (multidão)
  function soldado(x, y, s, corpo, elmo, lanca, flamula) {
    return `<g transform="translate(${x} ${y}) scale(${s})">
      ${lanca ? `<path d="M26 -20L44 -280" ${trac(7)}/><path d="M26 -20L44 -280" stroke="#9a7a45" stroke-width="3.5" stroke-linecap="round"/><path d="M44 -280l-6 -30 14 30z" fill="#cfd5d8" ${trac(2)}/>${flamula ? `<path d="M43 -262l46 12-46 20z" fill="${flamula}" ${trac(2.5)}/>` : ''}` : ''}
      <path d="M-28 6Q-34 -60 -16 -94L16 -94Q34 -60 28 6z" fill="${corpo}" ${trac(3.5)}/>
      <path d="M-16 -94L16 -94 22 -78 -22 -78z" fill="#8c9a98" ${trac(3)}/>
      <path d="M-8 -60h16" stroke="${TINTA}" stroke-width="3"/>
      <circle cx="0" cy="-112" r="17" fill="#ecc9a1" ${trac(3)}/>
      <path d="M-20 -112Q-22 -150 0 -164 22 -150 20 -112l-9 -2q-4 -10 -11 -10t-11 10z" fill="${elmo}" ${trac(3)}/>
      <circle cx="-6" cy="-110" r="2.2" fill="${TINTA}"/><circle cx="7" cy="-110" r="2.2" fill="${TINTA}"/>
    </g>`;
  }

  function estandarte(x, y, h, cor, cor2, branco) {
    return `<g transform="translate(${x} ${y})">
      <path d="M0 0V${-h}" ${trac(9)}/><path d="M0 0V${-h}" stroke="#a8844a" stroke-width="4.5"/>
      <circle cx="0" cy="${-h - 5}" r="9" fill="#d9b45a" ${trac(2.5)}/>
      <path d="M4 ${-h + 10}C50 ${-h - 4} 90 ${-h + 24} 150 ${-h + 8}V${-h + 96}C90 ${-h + 112} 50 ${-h + 84} 4 ${-h + 100}z" fill="${cor}" ${trac(3.5)}/>
      <path d="M62 ${-h + 24}v66M30 ${-h + 52}h66" stroke="${cor2}" stroke-width="13" ${branco ? '' : ''}/>
      <path d="M62 ${-h + 24}v66M30 ${-h + 52}h66" fill="none" stroke="${TINTA}" stroke-width="1.5" opacity=".6"/>
    </g>`;
  }

  function camadaMeio() {
    const r = semente(5);
    const corpos = ['#d66f2a', '#a8441f', '#b3312a', '#3b5ca0', '#d9a53a', '#6b7a3a', '#e2a24a'];
    const elmos = ['#7f8f8a', '#8a9aa0', '#6f7f83', '#9aa6a4'];
    let m = '';
    const fileira = (y, s, n, lancas) => {
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * (LARG / n) + entre(r, -26, 26);
        const corpo = corpos[Math.floor(r() * corpos.length)], elmo = elmos[Math.floor(r() * elmos.length)];
        const flam = r() < 0.5 ? (r() < 0.5 ? '#f2e7c8' : '#1c1a1d') : null;
        const lc = r() < lancas;
        const yy = y + entre(r, -8, 8);
        m += soldado(x, yy, s, corpo, elmo, lc, flam);
        if (x < 90) m += soldado(x + LARG, yy, s, corpo, elmo, lc, flam);
        if (x > LARG - 90) m += soldado(x - LARG, yy, s, corpo, elmo, lc, flam);
      }
    };
    fileira(640, 0.85, 17, 0.55);
    fileira(690, 1.0, 14, 0.5);
    fileira(745, 1.15, 11, 0.4);
    // estandartes dos reinos misturados na multidão
    m += estandarte(410, 700, 330, '#f4efe0', '#d9a53a');
    m += estandarte(1010, 700, 320, '#1c1a1d', '#b3312a');
    m += estandarte(1480, 690, 300, '#f4efe0', '#d9a53a');
    m += estandarte(150, 690, 300, '#1c1a1d', '#b3312a');
    return m;
  }

  /* cavaleiro (olhando para a direita); cada parte desenhada de trás para a frente */
  function cavaleiro(c) {
    const perna = (d, w) => `<path d="${d}" fill="none" stroke="${TINTA}" stroke-width="${w + 7}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${c.cavalo}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
    const casco = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="14" ry="8" fill="${TINTA}"/>`;
    const cruz = (x, y, k) => `<path d="M${x} ${y - 30 * k}v${60 * k}M${x - 24 * k} ${y - 6 * k}h${48 * k}" stroke="${c.sinal}" stroke-width="${11 * k}" stroke-linecap="butt" fill="none"/>`;
    let g = '';
    // cauda
    g += `<path d="M-116 -172C-168 -176 -196 -120 -184 -58 -170 -96 -150 -122 -116 -140z" fill="${c.crina}" ${trac(3.5)}/>`;
    // pernas de trás (mais escuras)
    g += perna('M-72 -108L-112 -56L-156 -14', 22) + casco(-160, -10);
    g += perna('M82 -108L128 -78L172 -44', 20) + casco(176, -40);
    // corpo
    g += `<path d="M-122 -150C-126 -216 -42 -224 38 -214 102 -208 134 -190 142 -160 146 -108 104 -96 40 -98 -30 -94 -118 -88 -122 -150z" fill="${c.cavalo}" ${trac(4)}/>`;
    // pescoço e cabeça
    g += `<path d="M84 -204C112 -250 136 -292 168 -316L210 -302C210 -272 196 -232 178 -190z" fill="${c.cavalo}" ${trac(4)}/>`;
    g += `<path d="M164 -316C184 -336 208 -330 220 -318L268 -262C278 -248 266 -234 252 -240L206 -260C190 -268 172 -288 164 -316z" fill="${c.cavalo}" ${trac(4)}/>`;
    g += `<path d="M86 -206C98 -252 124 -292 158 -322 150 -286 134 -254 120 -216z" fill="${c.crina}" ${trac(3.5)}/>`;
    g += `<path d="M166 -322l-4 -30 22 22z" fill="${c.cavalo}" ${trac(3.5)}/>`;
    g += `<circle cx="214" cy="-294" r="4.2" fill="${TINTA}"/><path d="M236 -258l12 8" ${trac(2.5)}/><path d="M196 -300Q220 -270 250 -246" fill="none" stroke="${c.sinal}" stroke-width="5"/>`;
    // pernas da frente
    g += perna('M62 -108L84 -52L58 -8', 22) + casco(54, -6);
    g += perna('M-96 -110L-76 -52L-92 -8', 22) + casco(-98, -6);
    // gualdrapa
    g += `<path d="M-112 -200L98 -200L104 -122Q96 -72 82 -80L64 -62 42 -82 20 -64 -2 -82 -24 -64 -46 -82 -68 -66 -92 -80Q-110 -92 -112 -130z" fill="${c.pano}" ${trac(3.5)}/>`;
    g += `<path d="M-100 -186L90 -186" stroke="${c.sinal}" stroke-width="7"/>` + cruz(-6, -138, 1);
    // cavaleiro: perna
    g += `<path d="M-6 -220L34 -190L16 -142" fill="none" stroke="${TINTA}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/><path d="M-6 -220L34 -190L16 -142" fill="none" stroke="${c.armadura}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 -140l26 6" ${trac(6)}/>`;
    // lança ou estandarte
    if (c.estandarte) {
      g += `<path d="M70 -286L58 -560" ${trac(9)}/><path d="M70 -286L58 -560" stroke="#a8844a" stroke-width="4.5" stroke-linecap="round"/>`;
      g += `<circle cx="57" cy="-566" r="9" fill="#d9b45a" ${trac(2.5)}/>`;
      g += `<path d="M58 -548C14 -572 -34 -526 -106 -546L-106 -446C-34 -428 14 -474 58 -450z" fill="${c.bandeira}" ${trac(3.5)}/>`;
      g += `<path d="M-24 -540v80M-60 -500h70" stroke="${c.sinal}" stroke-width="14" fill="none" transform="rotate(-6 -24 -500)"/>`;
    } else {
      g += `<path d="M-88 -240L380 -388" ${trac(10)}/><path d="M-88 -240L380 -388" stroke="#a8844a" stroke-width="5.5" stroke-linecap="round"/>`;
      g += `<path d="M380 -388L430 -404 384 -366z" fill="#d6dde0" ${trac(3)}/>`;
      g += `<path d="M330 -373C356 -332 392 -340 414 -310L386 -383z" fill="${c.bandeira}" ${trac(3)}/>`;
    }
    // tronco
    g += `<path d="M-30 -214L-34 -318Q-34 -346 -10 -348L20 -348Q42 -346 40 -318L36 -214z" fill="${c.pano}" ${trac(4)}/>`;
    g += `<path d="M-32 -240H38" stroke="${TINTA}" stroke-width="7"/><path d="M-32 -240H38" stroke="${c.sinal}" stroke-width="3"/>`;
    g += `<path d="M-30 -320L40 -320L40 -334Q10 -342 -30 -334z" fill="${c.armadura}" ${trac(3)}/>`;
    // escudo
    g += `<path d="M-14 -322L46 -322L46 -258Q46 -218 16 -196Q-14 -218 -14 -258z" fill="${c.escudo}" ${trac(4)}/>`;
    g += cruz(16, -270, 0.8);
    // cabeça com elmo
    g += `<circle cx="5" cy="-374" r="26" fill="${c.armadura}" ${trac(4)}/><path d="M-20 -378h50" stroke="${TINTA}" stroke-width="5"/><path d="M5 -376v22" stroke="${TINTA}" stroke-width="4"/><path d="M-14 -392Q5 -404 24 -392" fill="none" stroke="#fff" stroke-width="4" opacity=".55"/>`;
    g += `<path d="M5 -398C-18 -428 -56 -412 -58 -378 -44 -402 -22 -398 5 -398z" fill="${c.penacho}" ${trac(3)}/>`;
    // braço
    g += `<path d="M18 -330L72 -292" fill="none" stroke="${TINTA}" stroke-width="22" stroke-linecap="round"/><path d="M18 -330L72 -292" fill="none" stroke="${c.armadura}" stroke-width="14" stroke-linecap="round"/><circle cx="72" cy="-291" r="10" fill="${c.armadura}" ${trac(3)}/>`;
    return g;
  }

  const REINO_B = { cavalo: '#d9dcd8', crina: '#8a7a5a', pano: '#f2e7c8', sinal: '#d9a53a', armadura: '#cdd4d8', penacho: '#f4efe0', escudo: '#f2e7c8', bandeira: '#f4efe0' };
  const REINO_N = { cavalo: '#2a2f5e', crina: '#15152e', pano: '#2a2527', sinal: '#b3312a', armadura: '#6e747c', penacho: '#b3312a', escudo: '#2a2527', bandeira: '#1c1a1d' };

  function camadaFrente() {
    const r = semente(23);
    let m = '';
    // grama de fundo
    m += `<path d="M0 760C200 740 400 780 640 758S1040 740 1240 764 1500 752 1600 760V900H0z" fill="#5d7c34" ${trac(3.5)}/>`;
    const cav = (x, y, s, dir, base, extra) => `<g transform="translate(${x} ${y}) scale(${s * dir} ${s})">${cavaleiro({ ...base, ...extra })}</g>`;
    m += cav(420, 800, 0.62, 1, REINO_B, { cavalo: '#b49a78', estandarte: true });
    m += cav(1180, 800, 0.62, -1, REINO_N, { cavalo: '#4a2a1b', estandarte: true });
    m += cav(250, 830, 0.8, 1, REINO_B, {});
    m += cav(720, 850, 0.9, 1, REINO_B, { cavalo: '#e6e1d0', estandarte: true });
    m += cav(1020, 850, 0.9, -1, REINO_N, { cavalo: '#232648' });
    m += cav(1390, 830, 0.8, -1, REINO_N, { cavalo: '#58332a' });
    // grama de primeiro plano com tufos e restos de batalha
    m += `<path d="M0 840C220 816 420 860 700 836S1100 818 1320 846 1520 832 1600 840V900H0z" fill="#4a6a28" ${trac(3.5)}/>`;
    for (let i = 0; i < 46; i++) {
      const x = i * 36 + entre(r, -10, 10), y = 850 + entre(r, 0, 38), h = entre(r, 12, 26);
      m += `<path d="M${x} ${y}q-4 -${h * 0.6} -8 -${h}M${x} ${y}q1 -${h * 0.7} 2 -${h * 1.1}M${x} ${y}q4 -${h * 0.6} 9 -${h * 0.9}" fill="none" stroke="#2e4318" stroke-width="3" stroke-linecap="round"/>`;
    }
    m += `<g transform="translate(560 868) rotate(-8)"><path d="M0 0L50 0 50 40Q50 66 25 80 0 66 0 40z" fill="#b3312a" ${trac(3.5)}/><path d="M25 8v62M6 30h38" stroke="#d9b45a" stroke-width="7"/></g>`;
    m += `<g transform="translate(1360 872) rotate(10)"><path d="M0 0L50 0 50 40Q50 66 25 80 0 66 0 40z" fill="#3b5ca0" ${trac(3.5)}/><path d="M25 8v62M6 30h38" stroke="#f2e7c8" stroke-width="7"/></g>`;
    return m;
  }

  function montarCena() {
    const alvo = $('menu-fundo');
    if (!alvo || alvo.firstChild) return;
    const camadas = [
      ['ceu', camadaCeu()],
      ['meio', camadaMeio()],
      ['frente', camadaFrente()]
    ];
    camadas.forEach(([nome, conteudo]) => {
      const tile = id => `<svg viewBox="0 0 ${LARG} ${ALT}" preserveAspectRatio="xMidYMax slice" ${id ? '' : 'aria-hidden="true"'}>${conteudo}</svg>`;
      const el = document.createElement('div');
      el.className = 'camada camada-' + nome;
      // a segunda metade referencia os mesmos desenhos; ids de pattern ficam só na primeira
      el.innerHTML = tile(true) + tile(false).replace(/<defs>[\s\S]*?<\/defs>/, '');
      alvo.appendChild(el);
    });
  }

  /* ---------- Partículas ---------- */
  function criar(container, itens) {
    container.textContent = '';
    const frag = document.createDocumentFragment();
    itens.forEach(({ classe, estilo }) => {
      const i = document.createElement('i');
      if (classe) i.className = classe;
      Object.entries(estilo).forEach(([k, v]) => i.style.setProperty(k, v));
      frag.appendChild(i);
    });
    container.appendChild(frag);
  }

  function brasasMenu() {
    const r = Math.random;
    criar($('menu-brasas'), Array.from({ length: 28 }, () => {
      const d = entre(r, 7, 15);
      return { estilo: { '--x': entre(r, 0, 100).toFixed(1) + '%', '--s': entre(r, 3, 7).toFixed(1) + 'px', '--d': d.toFixed(1) + 's', '--t': (-r() * d).toFixed(1) + 's', '--dx': entre(r, -90, 90).toFixed(0) + 'px' } };
    }));
  }

  function faiscasIntro() {
    const r = Math.random;
    criar($('intro-faiscas'), Array.from({ length: 26 }, (_, n) => {
      const a = (n / 26) * Math.PI * 2 + entre(r, -0.2, 0.2), d = entre(r, 120, 360);
      return { estilo: { '--s': entre(r, 4, 9).toFixed(1) + 'px', '--dx': (Math.cos(a) * d).toFixed(0) + 'px', '--dy': (Math.sin(a) * d * 0.8).toFixed(0) + 'px' } };
    }));
  }

  function particulasResultado() {
    const tela = $('tela-resultado'), tipo = tela.dataset.tipo, reino = tela.dataset.reino;
    const r = Math.random;
    let cores, n;
    if (tipo === 'vitoria') {
      cores = reino === 'b' ? ['#f3d98b', '#d9b45a', '#c2361f', '#fff6d8', '#8a6a22'] : ['#f3d98b', '#d9b45a', '#fff6d8', '#e2bf62', '#b3312a', '#4f6b2a'];
      n = 64;
    } else if (tipo === 'derrota') { cores = ['#8a8582', '#5b5655', '#a49c98', '#403b3a']; n = 46; }
    else { cores = ['#e6ebf2', '#b9c1ce', '#ffffff']; n = 30; }
    criar($('resultado-particulas'), Array.from({ length: n }, (_, k) => {
      const d = tipo === 'vitoria' ? entre(r, 4, 8) : entre(r, 8, 16);
      const brasa = tipo === 'derrota' && k % 5 === 0;
      return {
        classe: brasa ? 'brasa' : '',
        estilo: {
          '--x': entre(r, 0, 100).toFixed(1) + '%',
          '--s': (tipo === 'vitoria' ? entre(r, 7, 13) : entre(r, 3, 8)).toFixed(1) + 'px',
          '--d': d.toFixed(1) + 's', '--t': (-r() * d).toFixed(1) + 's',
          '--dx': entre(r, -140, 140).toFixed(0) + 'px', '--r': (entre(r, 360, 1100) | 0) + 'deg',
          '--cor': brasa ? '#ff7a3a' : cores[k % cores.length]
        }
      };
    }));
  }

  montarCena();
  brasasMenu();
  faiscasIntro();
  window.addEventListener('tela', e => { if (e.detail === 'resultado') particulasResultado(); });
  return { montarCena, particulasResultado };
})();

/* ============================================================
   TELA REGRAS
   ============================================================ */
/* Tela de Regras: abas acessíveis geradas a partir de dados + helpers de mini-tabuleiro.
   Também publica INFO_PECA e Mini, usados pelo modo "Aprenda a Jogar" (75-aprendizado.js). */

/* ---------- Dados das peças ---------- */
const INFO_PECA = {
  K: { artigo: 'O', nome: 'Rei', funcao: 'O Rei é a peça mais importante do reino: se ele cair em xeque-mate, a batalha está perdida. Todas as outras peças existem para protegê-lo.',
       move: 'Anda uma casa por vez, em qualquer direção. Nunca pode ir para uma casa atacada pelo inimigo.', valor: 'Sem valor numérico: vale o próprio reino.' },
  Q: { artigo: 'A', nome: 'Dama', funcao: 'A Dama é a soberana do reino, a peça mais poderosa do exército. Ataca de longe e muda o rumo da batalha em um único lance.',
       move: 'Anda quantas casas quiser em linha reta: coluna, fileira ou diagonal, sem saltar peças.', valor: 'Vale 9 pontos.' },
  R: { artigo: 'A', nome: 'Torre', funcao: 'A Torre é a guardiã das muralhas. Domina colunas e fileiras abertas e protege o Rei no roque.',
       move: 'Anda quantas casas quiser na horizontal ou na vertical, sem saltar peças.', valor: 'Vale 5 pontos.' },
  B: { artigo: 'O', nome: 'Bispo', funcao: 'O Bispo é o estrategista do reino. Corta o tabuleiro em diagonais longas e fica sempre nas casas da mesma cor.',
       move: 'Anda quantas casas quiser na diagonal, sem saltar peças.', valor: 'Vale 3 pontos.' },
  N: { artigo: 'O', nome: 'Cavalo', funcao: 'O Cavalo é o especialista em ataques inesperados. É o único que salta por cima das outras peças.',
       move: 'Anda em L: duas casas em uma direção e uma para o lado. Pode pular sobre qualquer peça.', valor: 'Vale 3 pontos.' },
  P: { artigo: 'O', nome: 'Peão', funcao: 'O Peão é o soldado que avança pelo reino. Sozinho é fraco, mas em fileira forma a muralha e, se chegar ao fim do tabuleiro, vira uma peça poderosa.',
       move: 'Avança uma casa (duas no primeiro lance) e captura na diagonal. Nunca volta.', valor: 'Vale 1 ponto.' }
};
const ORDEM_PECAS = ['K', 'Q', 'R', 'B', 'N', 'P'];

/* ---------- Mini-tabuleiros (HTML/CSS + Pecas.svg) ---------- */
const Mini = (() => {
  // pecas: [[r, c, 'wK', fantasma?]]; marcas: [[r, c, 'alvo'|'captura'|'origem'|'perigo']]
  function grade({ linhas = 8, colunas = 8, pecas = [], marcas = [], rotulo = '', classe = '' }) {
    let h = `<div class="mini-wrap ${classe}" style="--mc:${colunas}"><div class="mini" role="img" aria-label="${rotulo}">`;
    for (let r = 0; r < linhas; r++) {
      for (let c = 0; c < colunas; c++) {
        const ms = marcas.filter(m => m[0] === r && m[1] === c).map(m => 'm-' + m[2]).join(' ');
        const p = pecas.find(x => x[0] === r && x[1] === c);
        const peca = p ? `<span class="mini-peca${p[3] ? ' fantasma' : ''}">${Pecas.svg(p[2][1], p[2][0])}</span>` : '';
        h += `<div class="mini-casa ${(r + c) % 2 ? 'escura' : 'clara'} ${ms}" style="z-index:${r + 1}">${peca}</div>`;
      }
    }
    return h + '</div></div>';
  }

  // Posição montada à mão para Regras.pseudo. pecas: [[r, c, 'wK']]
  function posicao(pecas, vez = 'w') {
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));
    pecas.forEach(([r, c, p]) => { board[r][c] = p; });
    let vazia = [0, 0];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (!board[r][c]) vazia = [r, c];
    const achar = k => { for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c] === k) return [r, c]; return vazia; };
    return {
      board, currentTurn: vez, castlingRights: { wK: false, wQ: false, bK: false, bQ: false },
      enPassantTarget: null, halfmoveClock: 0, fullmoveNumber: 1,
      whiteKingPosition: achar('wK'), blackKingPosition: achar('bK')
    };
  }

  // Casas de destino (sem duplicatas de promoção) de uma peça numa posição.
  function destinos(pos, r, c) {
    const vistos = new Set();
    return Regras.pseudo(pos, r, c).filter(m => {
      const k = m.r * 8 + m.c;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
  }
  return { grade, posicao, destinos };
})();

/* ---------- Conteúdo das abas ---------- */
const diagramaFig = (grade, legenda) => `<figure class="rg-fig">${grade}<figcaption>${legenda}</figcaption></figure>`;

// Diagrama dos movimentos de uma peça (8x8, a peça no centro, com obstáculos).
function diagramaMovimento(tipo) {
  const base = tipo === 'P' ? [[6, 4, 'wP'], [5, 3, 'bP'], [5, 5, 'bN']] : [[4, 3, 'w' + tipo]];
  if (tipo === 'N') base.push([3, 3, 'wP'], [4, 4, 'bP'], [2, 4, 'bP']);
  if (tipo === 'R') base.push([4, 6, 'bP'], [1, 3, 'wP']);
  if (tipo === 'B') base.push([2, 5, 'bP'], [6, 1, 'wP']);
  if (tipo === 'Q') base.push([2, 1, 'bP'], [4, 6, 'wP']);
  if (tipo === 'K') base.push([3, 4, 'bP']);
  const pos = Mini.posicao(base);
  const alvo = tipo === 'P' ? base[0] : base[0];
  const marcas = Mini.destinos(pos, alvo[0], alvo[1]).map(m => [m.r, m.c, pos.board[m.r][m.c] ? 'captura' : 'alvo']);
  marcas.push([alvo[0], alvo[1], 'origem']);
  return Mini.grade({ pecas: base, marcas, rotulo: 'Movimentos possíveis do ' + NOME_PECA[tipo] });
}

const REGRAS_ABAS = [
  { id: 'objetivo', titulo: 'Objetivo', html: () => `
    <h3 class="rg-gotico">O Objetivo</h3>
    <p class="rg-capitular">Dois reinos, o Branco e o Negro, disputam um só tabuleiro. As brancas começam e os turnos se alternam. Quem leva o Rei inimigo a um <strong>xeque-mate</strong> vence a guerra.</p>
    <div class="rg-historia">
      <div class="rg-reino rg-reino-w"><b>Reino Branco</b><span>Pedra clara, ouro e luz.</span></div>
      <div class="rg-reino rg-reino-b"><b>Reino Negro</b><span>Ferro, sombra e brasas.</span></div>
    </div>
    <h4>A pequena história</h4>
    <p>O tabuleiro é o campo de batalha e cada peça tem sua função no exército. O Rei comanda, a Dama lidera os ataques, as Torres guardam as muralhas, os Bispos traçam estratégias, os Cavalos surpreendem pelos flancos e os Peões marcham à frente.</p>
    <p>Não é preciso eliminar todo o exército inimigo. A guerra termina quando o Rei não tem mais como escapar.</p>
    <p class="rg-dica">Dica: o tabuleiro tem 8 × 8 casas. Cada jogador começa com 16 peças e a casa do canto inferior direito é sempre clara.</p>` },
  { id: 'xeque', titulo: 'Xeque', html: () => `
    <h3 class="rg-gotico">Xeque</h3>
    <p>Há <strong>xeque</strong> quando o Rei está sob ataque: alguma peça inimiga poderia capturá-lo no próximo lance. O Rei nunca é capturado de verdade, mas o jogador é obrigado a resolver a ameaça.</p>
    <div class="rg-lado">${diagramaFig(Mini.grade({ linhas: 5, colunas: 5, pecas: [[4, 2, 'wK'], [0, 2, 'bR']], marcas: [[4, 2, 'perigo'], [1, 2, 'alvo'], [2, 2, 'alvo'], [3, 2, 'alvo']], rotulo: 'Torre negra dando xeque no Rei branco' }), 'A Torre negra ataca o Rei branco pela coluna.')}</div>
    <h4>Como sair do xeque</h4>
    <ul class="rg-lista">
      <li><strong>Mover o Rei</strong> para uma casa segura.</li>
      <li><strong>Capturar</strong> a peça que ataca.</li>
      <li><strong>Bloquear</strong> o caminho com outra peça (não vale contra o Cavalo, que salta).</li>
    </ul>
    <p class="rg-dica">Você nunca pode fazer um lance que deixe o seu próprio Rei em xeque. O jogo não permite essa jogada.</p>` },
  { id: 'mate', titulo: 'Xeque-mate', html: () => `
    <h3 class="rg-gotico">Xeque-mate</h3>
    <p>É o fim da batalha: o Rei está em xeque e <strong>nenhum lance</strong> o salva. Ele não pode fugir, a peça atacante não pode ser capturada e o ataque não pode ser bloqueado.</p>
    <div class="rg-lado">${diagramaFig(Mini.grade({ linhas: 5, colunas: 5, pecas: [[0, 4, 'bK'], [1, 3, 'bP'], [1, 4, 'bP'], [0, 0, 'wR'], [4, 0, 'wK']], marcas: [[0, 4, 'perigo'], [0, 3, 'perigo']], rotulo: 'Xeque-mate de Torre no Rei negro encurralado' }), 'O Rei negro está atrás dos próprios peões. A Torre dá xeque e ele não tem para onde ir.')}</div>
    <p>Quem aplica o xeque-mate vence e a partida termina na hora.</p>` },
  { id: 'movimentos', titulo: 'Movimentos', html: () => `
    <h3 class="rg-gotico">Como as peças se movem</h3>
    <p>Pontos dourados são casas livres, anéis vermelhos são capturas possíveis. Uma peça captura indo até a casa da peça inimiga, que sai do tabuleiro.</p>
    <div class="rg-grade-mov">
      ${ORDEM_PECAS.map(t => `<figure class="rg-fig"><figcaption class="rg-fig-titulo">${INFO_PECA[t].artigo} ${INFO_PECA[t].nome}</figcaption>${diagramaMovimento(t)}<figcaption>${INFO_PECA[t].move}</figcaption></figure>`).join('')}
    </div>` },
  { id: 'roque', titulo: 'Roque', html: () => {
    const fila = (rei, torre, rot, ms = []) => Mini.grade({ linhas: 2, colunas: 8, pecas: [[1, rei, 'wK'], [1, torre, 'wR']], marcas: ms, rotulo: rot, classe: 'larga' });
    return `
    <h3 class="rg-gotico">Roque</h3>
    <p>O roque é um lance especial que protege o Rei e põe a Torre em ação. O Rei anda <strong>duas casas</strong> em direção à Torre, e a Torre salta para o outro lado dele.</p>
    <div class="rg-par">
      ${diagramaFig(fila(4, 7, 'Antes do roque curto', [[1, 6, 'alvo']]), 'Antes: Rei em e1 e Torre em h1.')}
      ${diagramaFig(fila(6, 5, 'Depois do roque curto'), 'Depois: Rei em g1 e Torre em f1.')}
    </div>
    <h4>Condições</h4>
    <ul class="rg-lista">
      <li>O Rei e a Torre ainda não podem ter se movido.</li>
      <li>Não pode haver peças entre os dois.</li>
      <li>O Rei não pode estar em xeque, nem passar ou parar numa casa atacada.</li>
    </ul>
    <p>Do lado da Dama o roque é “longo”: o Rei vai para c1 e a Torre para d1.</p>`; } },
  { id: 'promocao', titulo: 'Promoção', html: () => `
    <h3 class="rg-gotico">Promoção</h3>
    <p>Quando um Peão chega à última fileira do tabuleiro, ele é <strong>promovido</strong>: vira Dama, Torre, Bispo ou Cavalo, à sua escolha. Quase todo mundo escolhe a Dama, a peça mais forte.</p>
    <div class="rg-par">
      ${diagramaFig(Mini.grade({ linhas: 3, colunas: 3, pecas: [[1, 1, 'wP']], marcas: [[0, 1, 'alvo']], rotulo: 'Peão prestes a ser promovido' }), 'O Peão está a um passo do fim.')}
      ${diagramaFig(Mini.grade({ linhas: 3, colunas: 3, pecas: [[0, 1, 'wQ']], marcas: [[0, 1, 'origem']], rotulo: 'Peão promovido a Dama' }), 'Chegou ao fim: virou Dama!')}
    </div>
    <p class="rg-dica">Você pode ter mais de uma Dama ao mesmo tempo. Um simples soldado pode virar rainha.</p>` },
  { id: 'enpassant', titulo: 'En passant', html: () => `
    <h3 class="rg-gotico">En passant</h3>
    <p>Quando um Peão avança <strong>duas casas</strong> e para ao lado de um Peão inimigo, este pode capturá-lo como se o outro tivesse andado só uma casa. Mas só vale <strong>no lance seguinte</strong>.</p>
    <div class="rg-trio">
      ${diagramaFig(Mini.grade({ linhas: 4, colunas: 3, pecas: [[3, 1, 'wP'], [1, 2, 'bP']], marcas: [[2, 2, 'alvo'], [3, 2, 'alvo']], rotulo: 'Peão negro prestes a avançar duas casas' }), '1. O Peão negro avança duas casas.')}
      ${diagramaFig(Mini.grade({ linhas: 4, colunas: 3, pecas: [[3, 1, 'wP'], [3, 2, 'bP']], marcas: [[2, 2, 'captura']], rotulo: 'Peão branco pode capturar en passant' }), '2. Ele para ao lado do Peão branco.')}
      ${diagramaFig(Mini.grade({ linhas: 4, colunas: 3, pecas: [[2, 2, 'wP'], [3, 2, 'bP', true]], marcas: [[2, 2, 'origem']], rotulo: 'Captura en passant concluída' }), '3. O Peão branco captura na casa que ele pulou.')}
    </div>` },
  { id: 'empate', titulo: 'Empate', html: () => `
    <h3 class="rg-gotico">Empate</h3>
    <p>Nem toda guerra tem vencedor. A partida termina empatada quando:</p>
    <div class="rg-empates">
      <div class="rg-lado">${diagramaFig(Mini.grade({ linhas: 5, colunas: 5, pecas: [[0, 0, 'bK'], [1, 2, 'wQ'], [4, 4, 'wK']], marcas: [[0, 1, 'perigo'], [1, 0, 'perigo'], [1, 1, 'perigo']], rotulo: 'Afogamento: Rei negro sem lances' }), 'Afogamento: o Rei negro não está em xeque, mas qualquer casa é atacada.')}</div>
      <ul class="rg-lista">
        <li><strong>Afogamento (rei afogado):</strong> quem deve jogar não está em xeque e não tem nenhum lance legal.</li>
        <li><strong>Material insuficiente:</strong> não sobrou força para dar xeque-mate (por exemplo, só os dois Reis, ou um Rei contra Rei e Bispo ou Cavalo).</li>
        <li><strong>Regra dos 50 lances:</strong> 50 lances de cada jogador sem mover um Peão e sem nenhuma captura.</li>
        <li><strong>Repetição tripla:</strong> a mesma posição aparece três vezes na partida.</li>
      </ul>
    </div>` },
  { id: 'pontos', titulo: 'Pontuação', html: () => `
    <h3 class="rg-gotico">Pontuação</h3>
    <p>Cada peça capturada soma pontos ao placar de quem a capturou. Assim fica fácil ver quem está ganhando a guerra.</p>
    <ul class="rg-pontos">
      ${['P', 'N', 'B', 'R', 'Q', 'K'].map(t => `<li><span class="rg-pontos-peca">${Pecas.svg(t, 'w')}</span><b>${INFO_PECA[t].nome}</b><span class="rg-pontos-valor">${t === 'K' ? 'sem valor' : VALOR_PECA[t]}</span></li>`).join('')}
    </ul>
    <p class="rg-dica">O Rei não tem valor numérico: ele não é capturado, a partida acaba antes, em xeque-mate.</p>` },
  { id: 'funcao', titulo: 'Função das peças', html: () => `
    <h3 class="rg-gotico">Função das Peças</h3>
    <p>Cada peça é um integrante do exército. Escolha o reino e conheça os pergaminhos de cada uma.</p>
    <div class="rg-reino-toggle" role="group" aria-label="Reino das peças">
      <button type="button" class="placa pequena" data-reino="w" aria-pressed="true">Reino Branco</button>
      <button type="button" class="placa pequena" data-reino="b" aria-pressed="false">Reino Negro</button>
    </div>
    <div class="rg-galeria" id="rg-galeria"></div>` }
];

/* ---------- Pergaminhos da galeria ---------- */
function pergaminhoPeca(t, cor) {
  const i = INFO_PECA[t];
  return `<article class="rg-rolo" data-peca="${t}" data-reino="${cor}">
    <div class="rg-rolo-ponta topo" aria-hidden="true"></div>
    <div class="rg-rolo-corpo">
      <span class="rg-roseta a" aria-hidden="true"></span><span class="rg-roseta b" aria-hidden="true"></span><span class="rg-roseta c" aria-hidden="true"></span><span class="rg-roseta d" aria-hidden="true"></span>
      <div class="rg-rolo-miolo">
        <h4 class="rg-rolo-titulo">${i.artigo} ${i.nome}</h4>
        <figure class="rg-iluminura" ${t === 'Q' ? 'data-ovo="dama"' : ''} ${t === 'K' ? 'data-ovo="rei"' : ''}>${Pecas.svg(t, cor)}</figure>
        <p class="rg-lema">${LEMA_PECA[t]}</p>
        <p>${i.funcao}</p>
        <p><strong>Como se move:</strong> ${i.move}</p>
        <p class="rg-valor">${i.valor}</p>
      </div>
    </div>
    <div class="rg-rolo-ponta base" aria-hidden="true"></div>
  </article>`;
}

function desenharGaleria(cor) {
  $('rg-galeria').innerHTML = ORDEM_PECAS.map(t => pergaminhoPeca(t, cor)).join('');
}

/* ---------- Montagem das abas ---------- */
(function montarRegras() {
  const raiz = $('regras-conteudo');
  raiz.innerHTML = `
    <div class="rg-abas" role="tablist" aria-label="Seções das regras">
      ${REGRAS_ABAS.map((a, i) => `<button type="button" role="tab" class="rg-aba" id="rg-aba-${a.id}" aria-controls="rg-painel-${a.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-aba="${a.id}">${a.titulo}</button>`).join('')}
    </div>
    <div class="rg-paineis">
      ${REGRAS_ABAS.map((a, i) => `<section class="rg-painel" role="tabpanel" id="rg-painel-${a.id}" aria-labelledby="rg-aba-${a.id}" ${i ? 'hidden' : ''} tabindex="0">${a.html()}</section>`).join('')}
    </div>`;

  const abas = $$('.rg-aba', raiz), paineis = $$('.rg-painel', raiz);
  desenharGaleria('w');

  function ativar(i, foco) {
    abas.forEach((a, j) => {
      a.setAttribute('aria-selected', j === i);
      a.tabIndex = j === i ? 0 : -1;
      paineis[j].hidden = j !== i;
    });
    if (foco) abas[i].focus();
    abas[i].scrollIntoView({ block: 'nearest', inline: 'center' });
    Sons.tocar('clique');
  }
  abas.forEach((a, i) => a.addEventListener('click', () => ativar(i)));
  $('regras-conteudo').querySelector('.rg-abas').addEventListener('keydown', e => {
    const atual = abas.findIndex(a => a.getAttribute('aria-selected') === 'true');
    let novo = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') novo = (atual + 1) % abas.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') novo = (atual - 1 + abas.length) % abas.length;
    else if (e.key === 'Home') novo = 0;
    else if (e.key === 'End') novo = abas.length - 1;
    if (novo === null) return;
    e.preventDefault();
    ativar(novo, true);
  });

  // Alternância entre os reinos na galeria
  raiz.querySelectorAll('[data-reino]').forEach(b => {
    if (b.tagName !== 'BUTTON') return;
    b.addEventListener('click', () => {
      $$('.rg-reino-toggle button', raiz).forEach(x => x.setAttribute('aria-pressed', x === b));
      desenharGaleria(b.dataset.reino);
      Sons.tocar('clique');
    });
  });
  // Ao reabrir a tela, volta para a primeira aba
  window.addEventListener('tela', e => { if (e.detail === 'regras') ativar(0); });
})();

/* ============================================================
   APRENDIZADO
   ============================================================ */
/* Modo "Aprenda a Jogar": escolha uma peça, veja onde ela pode ir num tabuleiro de demonstração
   interativo (2D, de cima) e cumpra um pequeno desafio. Usa Regras.pseudo e Mini (70-tela-regras.js).
   Nada aqui toca em S: a demonstração tem a própria posição. */

const APRENDER_CENAS = {
  K: { pecas: [[4, 4, 'wK'], [3, 3, 'bP']], bandeira: [1, 6], limite: 3,
       explicacao: 'O Rei anda uma única casa por vez, em qualquer direção: para frente, para trás, para os lados e nas diagonais. Ele pode capturar peças inimigas, mas nunca pode ir para uma casa onde seria atacado.' },
  Q: { pecas: [[5, 2, 'wQ'], [3, 4, 'wP'], [5, 5, 'bP'], [2, 1, 'bN']], bandeira: [0, 7], limite: 2,
       explicacao: 'A Dama junta o poder da Torre e do Bispo: anda quantas casas quiser em linha reta, na vertical, na horizontal ou na diagonal. Não salta peças: para diante de uma aliada e pode capturar a primeira inimiga do caminho.' },
  R: { pecas: [[7, 0, 'wR'], [7, 1, 'wP'], [5, 3, 'wP'], [3, 4, 'bP']], bandeira: [0, 5], limite: 2,
       explicacao: 'A Torre anda quantas casas quiser na horizontal ou na vertical. Não pode saltar peças. É forte em colunas e fileiras abertas e ajuda o Rei no roque.' },
  B: { pecas: [[7, 2, 'wB'], [5, 0, 'bN'], [6, 5, 'wP']], bandeira: [1, 6], limite: 2,
       explicacao: 'O Bispo anda quantas casas quiser na diagonal e não salta peças. Como só anda na diagonal, ele fica a partida inteira nas casas da mesma cor em que começou.' },
  N: { pecas: [[7, 1, 'wN'], [6, 1, 'wP'], [6, 2, 'wP'], [6, 3, 'wP'], [5, 2, 'bP'], [4, 3, 'bP']], bandeira: [1, 4], limite: 3,
       explicacao: 'O Cavalo anda em L: duas casas em uma direção e uma para o lado. Ele é o único que pode saltar por cima de outras peças, aliadas ou inimigas. Repare nos peões à sua volta: não o impedem.' },
  P: { pecas: [[6, 4, 'wP'], [5, 3, 'bP'], [5, 5, 'bN']], bandeira: [3, 3], limite: 3,
       explicacao: 'O Peão avança uma casa para frente (duas no primeiro lance) e captura na diagonal. Não anda para trás nem captura de frente. Ao chegar ao fim do tabuleiro, é promovido a Dama.' }
};

const Aprender = (() => {
  const raiz = $('aprender-conteudo');
  let A = null;          // estado da demonstração
  let tipoAtual = 'N';   // peça em exibição
  let escolhida = 'N';   // cartão escolhido (a peça em exibição pode virar Dama)

  raiz.innerHTML = `
    <div class="ap-seletor" role="group" aria-label="Escolha uma peça">
      ${ORDEM_PECAS.map(t => `<button type="button" class="ap-cartao" data-tipo="${t}" aria-pressed="false" aria-label="${INFO_PECA[t].nome}" ${t === 'Q' ? 'data-ovo="dama"' : ''}>${Pecas.svg(t, 'w')}<span>${INFO_PECA[t].nome}</span></button>`).join('')}
    </div>
    <div class="ap-corpo">
      <div class="ap-tab-wrap"><div class="ap-tab-moldura"><div class="ap-tab" id="ap-tab" role="group" aria-label="Tabuleiro de demonstração"><div class="ap-pecas" id="ap-pecas"></div></div></div></div>
      <div class="ap-info" aria-live="polite">
        <h3 class="ap-nome" id="ap-nome"></h3>
        <p class="ap-lema" id="ap-lema"></p>
        <h4>Função</h4><p id="ap-funcao"></p>
        <h4>Como se move</h4><p id="ap-explicacao"></p>
        <div class="ap-desafio" id="ap-desafio">
          <strong>Desafio</strong>
          <p id="ap-desafio-texto"></p>
          <p class="ap-contador" id="ap-contador"></p>
        </div>
        <div class="ap-acoes"><button type="button" class="placa pequena" id="ap-reiniciar">Recomeçar</button></div>
      </div>
    </div>`;

  const tab = $('ap-tab'), camada = $('ap-pecas');
  // 64 casas (botões) dentro do tabuleiro, antes da camada de peças
  const casas = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ap-casa ' + ((r + c) % 2 ? 'escura' : 'clara');
      b.dataset.r = r; b.dataset.c = c;
      b.tabIndex = -1;
      tab.insertBefore(b, camada);
      casas.push(b);
    }
  }
  const casa = (r, c) => casas[r * 8 + c];
  const pecaEl = new Map();   // "r,c" -> elemento da peça

  function pecaHTML(p) {
    return `<span>${Pecas.svg(p[1], p[0])}</span>`;
  }

  function carregar(tipo) {
    tipoAtual = tipo;
    const cena = APRENDER_CENAS[tipo], info = INFO_PECA[tipo];
    const pecas = cena.pecas.map(p => p.slice());
    const pos = Mini.posicao(pecas);
    const ativa = pecas.find(p => p[2] === 'w' + tipo);
    A = { tipo, cena, pos, em: [ativa[0], ativa[1]], lances: 0, ocupado: false, feito: false };

    $$('.ap-cartao', raiz).forEach(b => b.setAttribute('aria-pressed', b.dataset.tipo === tipo));
    $('ap-nome').textContent = `${info.artigo} ${info.nome}`;
    $('ap-lema').textContent = LEMA_PECA[tipo];
    $('ap-funcao').textContent = info.funcao;
    $('ap-explicacao').textContent = cena.explicacao;
    $('ap-desafio-texto').innerHTML = `Leve ${info.artigo === 'O' ? 'o' : 'a'} ${info.nome} até a bandeira em <strong>${cena.limite} lances</strong> ou menos. Capturar peças inimigas vale!`;
    $('ap-desafio').dataset.ok = '0';

    camada.innerHTML = '';
    pecaEl.clear();
    casas.forEach(b => { b.className = 'ap-casa ' + ((+b.dataset.r + +b.dataset.c) % 2 ? 'escura' : 'clara'); });
    casa(cena.bandeira[0], cena.bandeira[1]).classList.add('bandeira');
    pecas.forEach(p => {
      const el = document.createElement('div');
      el.className = 'ap-p';
      el.style.transform = `translate(${p[1] * 100}%, ${p[0] * 100}%)`;
      el.innerHTML = pecaHTML([p[2][0], p[2][1]]);
      if (p === ativa) { el.classList.add('mover'); el.dataset.ativa = '1'; if (tipo === 'Q') el.dataset.ovo = 'dama'; }
      camada.appendChild(el);
      pecaEl.set(p[0] + ',' + p[1], el);
    });
    atualizar();
  }

  // Recalcula e desenha as casas possíveis da peça ativa
  function atualizar() {
    const [r, c] = A.em;
    const alvos = new Map(Mini.destinos(A.pos, r, c).map(m => [m.r * 8 + m.c, m]));
    casas.forEach((b, i) => {
      const alvo = alvos.get(i);
      const cr = i >> 3, cc = i & 7;
      b.classList.toggle('livre', !!alvo);
      b.classList.toggle('captura', !!alvo && !!A.pos.board[cr][cc]);
      b.tabIndex = alvo ? 0 : -1;
      b.setAttribute('aria-label', nomeCasa(cr, cc) + (alvo ? (A.pos.board[cr][cc] ? ', captura possível' : ', casa possível') : '') + (b.classList.contains('bandeira') ? ', bandeira' : ''));
    });
    $('ap-contador').textContent = `Lances: ${A.lances} / ${A.cena.limite}`;
  }

  function mover(r, c) {
    if (!A || A.ocupado) return;
    const [fr, fc] = A.em;
    const alvo = Mini.destinos(A.pos, fr, fc).find(m => m.r === r && m.c === c);
    if (!alvo) return;
    A.ocupado = true;
    const el = pecaEl.get(fr + ',' + fc);
    const capturada = pecaEl.get(r + ',' + c);
    if (capturada) {
      capturada.classList.add('saindo');
      setTimeout(() => capturada.remove(), 300);
      pecaEl.delete(r + ',' + c);
      Sons.tocar('captura');
    } else Sons.tocar('mover');
    A.pos.board[r][c] = A.pos.board[fr][fc];
    A.pos.board[fr][fc] = null;
    pecaEl.delete(fr + ',' + fc);
    pecaEl.set(r + ',' + c, el);
    A.em = [r, c];
    A.lances++;
    el.style.transform = `translate(${c * 100}%, ${r * 100}%)`;
    // casas possíveis somem durante o passo
    casas.forEach(b => b.classList.remove('livre', 'captura'));

    esperar(movimentoReduzido() ? 0 : 340).then(() => {
      if (!A) return;
      if (A.tipo === 'P' && r === 0) {   // promoção na demonstração
        A.pos.board[r][c] = 'wQ';
        el.innerHTML = pecaHTML(['w', 'Q']);
        A.tipo = 'Q';
        Sons.tocar('promocao');
        aviso('O Peão chegou ao fim do tabuleiro e foi <strong>promovido a Dama</strong>!', 3200);
      }
      A.ocupado = false;
      atualizar();
      verificarDesafio(r, c);
      const foco = document.activeElement;
      if (foco && foco.classList && foco.classList.contains('ap-casa') && !foco.classList.contains('livre')) {
        const prox = casas.find(b => b.classList.contains('livre'));
        if (prox) prox.focus({ preventScroll: true });
      }
    });
  }

  function verificarDesafio(r, c) {
    const [br, bc] = A.cena.bandeira;
    if (r !== br || c !== bc || A.feito) return;
    if (A.lances <= A.cena.limite) {
      A.feito = true;
      $('ap-desafio').dataset.ok = '1';
      casa(r, c).classList.add('feita');
      Sons.tocar('segredo');
      aviso(`<strong>Desafio cumprido!</strong> ${INFO_PECA[tipoAtual].nome} na bandeira em ${A.lances} lance${A.lances > 1 ? 's' : ''}. Boa, estrategista!`, 3600);
    } else {
      aviso(`Chegou em ${A.lances} lances. Tente de novo em ${A.cena.limite} ou menos: toque em Recomeçar.`, 3600);
    }
  }

  tab.addEventListener('click', e => {
    const b = e.target.closest('.ap-casa');
    if (b && (b.classList.contains('livre'))) mover(+b.dataset.r, +b.dataset.c);
  });
  raiz.addEventListener('click', e => {
    const card = e.target.closest('.ap-cartao');
    if (card) { Sons.tocar('clique'); escolhida = card.dataset.tipo; carregar(escolhida); }
  });
  $('ap-reiniciar').addEventListener('click', () => { Sons.tocar('clique'); carregar(escolhida); });

  window.addEventListener('tela', e => { if (e.detail === 'aprender') carregar(escolhida); });
  carregar('N');
  return { carregar, mover, estado: () => A };
})();

/* ============================================================
   EASTER EGGS
   ============================================================ */
/* Easter eggs: segredos temáticos da guerra dos reinos.
   Regra de ouro: NUNCA tocam em S, regras, turno ou bot. Só efeitos visuais temporários
   (camada fixa sem eventos de ponteiro), sons e aviso(). Tudo se desfaz sozinho.

   COMO ATIVAR
   - Pokémon (evolução): promover um peão na partida -> "O quê? O PEÃO está evoluindo!" + brilho branco piscante.
   - Pokémon (pokébola): digitar "pokebola" -> pokébola rolando pela tela.
   - Zelda (Triforce): digitar "triforce" (ou ↑ ↑ ↓ ↓ ← → ← →, fora da partida) -> Triforce + espada mestra.
   - Zelda (baú): fazer um roque -> "Você abriu o baú! ♪ da-da-da-DAAA".
   - Melanie Martinez: digitar "crybaby", ou clicar 7 vezes na Dama (cartão em Aprenda a Jogar
     ou pergaminho da Dama em Regras > Função das peças) -> cores de casa de bonecas e lágrimas.
   - Desenvolvedores: digitar "isadora", "nicolas" ou "yasmin" (um efeito para cada).
   - Créditos: clicar 5 vezes no título "Xadrez Medieval" do menu.
   - Mate do Pastor: dar xeque-mate antes do 10º lance.
   - Longa vida ao Rei: clicar 5 vezes no Rei em Regras > Função das peças.
   - Excalibur: digitar "excalibur".
   As teclas digitadas dentro de campos de texto são ignoradas. Achados ficam em localStorage (xm-segredos). */

const Ovos = (() => {
  const CHAVE = 'xm-segredos';
  const TOTAL = 12;
  let achados = new Set();
  try { achados = new Set(JSON.parse(localStorage.getItem(CHAVE) || '[]')); } catch (e) { /* sem armazenamento */ }

  /* ---------- Infraestrutura ---------- */
  let camada = null;
  function pegarCamada() {
    if (!camada) {
      camada = document.createElement('div');
      camada.className = 'ovo-camada';
      camada.setAttribute('aria-hidden', 'true');
      document.body.appendChild(camada);
    }
    return camada;
  }
  // Efeito visual temporário: some sozinho depois de "ms"
  function efeito(classe, html, ms) {
    const el = document.createElement('div');
    el.className = 'ovo-efeito ' + classe;
    el.innerHTML = html || '';
    pegarCamada().appendChild(el);
    setTimeout(() => el.remove(), ms);
    return el;
  }
  function temporario(classe, ms) {
    document.body.classList.add(classe);
    setTimeout(() => document.body.classList.remove(classe), ms);
  }
  // Partículas que caem (lágrimas, pétalas, bolhas)
  function chuva(n, classe, glifo, ms) {
    let h = '';
    for (let i = 0; i < n; i++) {
      h += `<span class="ovo-gota ${classe}" style="left:${Math.round(Math.random() * 100)}%;animation-delay:${(Math.random() * 1.6).toFixed(2)}s;animation-duration:${(2.2 + Math.random() * 1.6).toFixed(2)}s;font-size:${(1 + Math.random() * 1.6).toFixed(1)}rem">${glifo}</span>`;
    }
    return efeito('ovo-chuva', h, ms);
  }
  const som = nome => { try { Sons.tocar(nome); } catch (e) { /* sem áudio */ } };
  // Mostra a mensagem do segredo e o registra
  function revelar(id, html, ms, classe, nomeSom = 'segredo') {
    const eraNovo = !achados.has(id);
    achados.add(id);
    try { localStorage.setItem(CHAVE, JSON.stringify([...achados])); } catch (e) { /* sem armazenamento */ }
    som(nomeSom);
    aviso(html + `<small class="ovo-contagem">Segredo ${eraNovo ? 'novo' : 'revisto'}: ${achados.size}/${TOTAL}</small>`, ms, 'ovo-aviso ' + classe);
  }

  /* ---------- Segredos ---------- */
  function evolucao(d) {
    const nome = NOME_PECA[d.peca] || 'Dama', reino = d.cor === 'w' ? 'Branco' : 'Negro';
    revelar('pokemon-evolucao', 'O quê? O <strong>PEÃO</strong> está evoluindo!', 2200, 'ovo-poke');
    efeito('ovo-evolui', `<div class="ovo-silhueta">${Pecas.svg('P', d.cor || 'w')}</div>`, 2400);
    setTimeout(() => revelar('pokemon-evolucao', `Parabéns! Seu Peão do Reino ${reino} evoluiu para <strong>${nome}</strong>!`, 3400, 'ovo-poke', 'promocao'), 2300);
  }
  function pokebola() {
    efeito('ovo-pokebola', '<i></i>', 3000);
    revelar('pokemon-bola', 'Vá, Pokébola! Aqui não se captura o Pokémon, e sim o Rei inimigo: só com xeque-mate.', 4200, 'ovo-poke');
  }
  const TRIFORCE = '<svg viewBox="0 0 120 105" aria-hidden="true"><g fill="#f3d98b" stroke="#8a6a22" stroke-width="2" stroke-linejoin="round"><path d="M60 3 90 53H30z"/><path d="M30 53 60 103H0z"/><path d="M90 53 120 103H60z"/></g></svg>';
  const ESPADA = '<svg viewBox="0 0 400 60" aria-hidden="true"><defs><linearGradient id="ovo-lamina" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2f6ff"/><stop offset=".5" stop-color="#b8c4de"/><stop offset="1" stop-color="#7c88a8"/></linearGradient></defs><path d="M110 24h270l18 6-18 6H110z" fill="url(#ovo-lamina)" stroke="#33405c" stroke-width="1.5"/><rect x="92" y="8" width="18" height="44" rx="4" fill="#2c4a9a" stroke="#d9b45a" stroke-width="3"/><rect x="40" y="24" width="52" height="12" rx="4" fill="#5a3b1a" stroke="#d9b45a" stroke-width="2"/><circle cx="34" cy="30" r="8" fill="#d9b45a"/></svg>';
  function triforce() {
    efeito('ovo-triforce', TRIFORCE, 4200);
    efeito('ovo-espada', ESPADA, 3600);
    revelar('zelda-triforce', 'É perigoso ir sozinho! <strong>Leve isto.</strong>', 4200, 'ovo-zelda');
  }
  function bau() {
    efeito('ovo-bau', '<span>&#9876;</span>', 2300);
    revelar('zelda-bau', 'Você abriu o baú! <strong>&#9834; da-da-da-DAAA</strong>', 2800, 'ovo-zelda');
  }

  const CHORAO = [
    'Cry Baby: até a Dama chora quando o reino cai...',
    'Dollhouse: atrás das muralhas todo reino parece perfeito, até o primeiro xeque.',
    'Soap: lave as lágrimas, a guerra continua no próximo lance.',
    'Play Date: os peões brincam de guerra, mas ninguém avisou que o rei jogava de verdade.'
  ];
  let ciclo = 0;
  function crybaby() {
    const msg = CHORAO[ciclo++ % CHORAO.length];
    temporario('ovo-crybaby', 6500);
    efeito('ovo-tinta', '', 6500);
    chuva(16, 'lagrima', '&#9679;', 6500);
    chuva(8, 'bolha', '&#9675;', 6500);
    revelar('melanie', msg, 5200, 'ovo-melanie');
  }

  const DEVS = {
    isadora: { id: 'dev-isadora', msg: '<strong>Isadora</strong>, a Arquiteta do Reino, ergueu as muralhas deste tabuleiro.', classe: 'ovo-isadora' },
    nicolas: { id: 'dev-nicolas', msg: '<strong>Nicolas</strong>, o Mestre dos Cavaleiros, traçou cada salto em L desta guerra.', classe: 'ovo-nicolas' },
    yasmin: { id: 'dev-yasmin', msg: '<strong>Yasmin</strong>, a Rainha das Crônicas, deu vida e coroa a este reino.', classe: 'ovo-yasmin' }
  };
  function dev(nome) {
    const d = DEVS[nome];
    if (nome === 'isadora') efeito('ovo-muralha', '<b></b>', 3600);
    if (nome === 'nicolas') efeito('ovo-salto', '<span>&#9822;</span>', 3600);
    if (nome === 'yasmin') { efeito('ovo-coroa', '<span>&#9819;</span>', 3600); chuva(18, 'petala', '&#10022;', 4000); }
    revelar(d.id, d.msg, 4200, d.classe);
  }

  const CURIOSIDADES = [
    'Dizem os bardos que o xadrez nasceu na Índia, como o jogo de guerra "chaturanga", muito antes dos dois reinos deste tabuleiro.',
    'Na Idade Média, a Dama andava só uma casa na diagonal. Ela só virou a soberana do tabuleiro por volta de 1500.',
    'Os peões já foram chamados de infantaria: os soldados que marcham à frente do exército.',
    'A Torre era, antigamente, uma carruagem de guerra. Só depois virou muralha.'
  ];
  function creditos() {
    som('segredo');
    achados.add('creditos');
    try { localStorage.setItem(CHAVE, JSON.stringify([...achados])); } catch (e) { /* sem armazenamento */ }
    Dialogo.abrir({
      titulo: 'Crônica dos Artífices do Reino',
      corpo: `<div class="ovo-creditos"><p>Este tabuleiro foi forjado por:</p>
        <ul><li><b>Isadora</b><span>Arquiteta do Reino</span></li><li><b>Nicolas</b><span>Mestre dos Cavaleiros</span></li><li><b>Yasmin</b><span>Rainha das Crônicas</span></li></ul>
        <p class="ovo-curio"><em>Curiosidade da guerra:</em> ${CURIOSIDADES[Math.floor(Math.random() * CURIOSIDADES.length)]}</p>
        <small class="ovo-contagem">Segredos achados: ${achados.size}/${TOTAL}</small></div>`,
      botoes: [{ texto: 'Fechar', valor: true }]
    });
  }
  function mateDoPastor() {
    revelar('mate-pastor', '<strong>Mate do Pastor!</strong> Um clássico dos bardos.', 4800, 'ovo-pastor');
    efeito('ovo-coroa', '<span>&#9812;</span>', 3000);
  }
  function reiVivas() {
    revelar('rei', 'Longa vida ao Rei! Ele anda uma casa por vez, mas o reino inteiro anda por ele.', 4200, 'ovo-pastor');
    chuva(14, 'petala', '&#10022;', 4000);
  }
  function excalibur() {
    efeito('ovo-espada', ESPADA, 3600);
    revelar('excalibur', 'Somente o verdadeiro rei retira a espada da pedra. Ou quem der o xeque-mate.', 4600, 'ovo-pastor');
  }

  /* ---------- Teclado ---------- */
  const PALAVRAS = { pokebola, triforce, crybaby, excalibur, isadora: () => dev('isadora'), nicolas: () => dev('nicolas'), yasmin: () => dev('yasmin') };
  const SETAS = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  let buffer = '';
  window.addEventListener('keydown', e => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = SETAS[e.key] || (e.key.length === 1 ? e.key.toLowerCase() : '');
    if (!k) return;
    buffer = (buffer + k).slice(-24);
    if (buffer.endsWith('↑↑↓↓←→←→') && document.body.dataset.tela !== 'jogo') { buffer = ''; triforce(); return; }
    for (const p in PALAVRAS) {
      if (buffer.endsWith(p)) { buffer = ''; PALAVRAS[p](); return; }
    }
  });

  /* ---------- Cliques repetidos ---------- */
  const contagem = {};
  function contar(chave, alvo, janela, acao) {
    const c = contagem[chave] || (contagem[chave] = { n: 0, t: 0 });
    const agora = Date.now();
    c.n = agora - c.t > janela ? 1 : c.n + 1;
    c.t = agora;
    if (c.n >= alvo) { c.n = 0; acao(); }
  }
  document.addEventListener('click', e => {
    if (!e.target.closest) return;
    if (e.target.closest('#titulo-jogo')) contar('titulo', 5, 2500, creditos);
    const ovo = e.target.closest('[data-ovo]');
    if (!ovo) return;
    if (ovo.dataset.ovo === 'dama') contar('dama', 7, 4000, crybaby);
    if (ovo.dataset.ovo === 'rei') contar('rei', 5, 3000, reiVivas);
  });

  /* ---------- Eventos da partida ---------- */
  window.addEventListener('xadrez', e => {
    const d = e.detail || {};
    if (d.evento === 'promocao') evolucao(d);
    else if (d.evento === 'roque') bau();
    else if (d.evento === 'xequemate' && typeof S !== 'undefined' && S.fullmoveNumber < 10) mateDoPastor();
  });

  return { crybaby, triforce, pokebola, dev, creditos, achados: () => [...achados] };
})();

/* ============================================================
   INICIO
   ============================================================ */
/* Inicialização: monta o tabuleiro e libera o áudio no primeiro gesto do usuário. */
Tabuleiro.montar(aoClicarCasa);
const liberarAudio = () => {
  Sons.iniciar();
  Sons.musica(telaAtual === 'jogo' || telaAtual === 'intro' ? 'batalha' : 'menu');
  window.removeEventListener('pointerdown', liberarAudio);
  window.removeEventListener('keydown', liberarAudio);
};
window.addEventListener('pointerdown', liberarAudio);
window.addEventListener('keydown', liberarAudio);

