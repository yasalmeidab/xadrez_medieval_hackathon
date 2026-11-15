# Xadrez Medieval

## Objetivo

Desenvolva um jogo de xadrez medieval em HTML, CSS e JavaScript. O tabuleiro representa uma batalha entre os Reinos Branco e Negro; cada peça representa um integrante do exército. A prioridade é oferecer xadrez correto e fácil de entender, com identidade visual medieval.

## Estrutura do projeto

- `index.html`: documento principal e todas as telas da aplicação (antes chamado `basexadrez.html`; renomeado para o GitHub Pages abrir o jogo na raiz).
- `style.css`: estilos, animações, transições e responsividade.
- `script.js`: navegação, estado da partida, regras, bot e interações.
- `imgs/`: imagens finais usadas no jogo. Os nomes no código devem corresponder aos arquivos reais.
- `refimgs/`: referências visuais classificadas por tema; analise-as antes de implementar mudanças visuais.
- `especificacao-xadrez-medieval.pdf`: especificação original do projeto.
- `PROJETO.md`: especificação completa extraída do PDF; consulte-o para requisitos detalhados.

Mantenha um único arquivo HTML, um único arquivo CSS e um único arquivo JavaScript. Use `index.html` como base e preserve o que já funciona ao fazer alterações. Organize CSS e JavaScript em seções claras, sem criar arquivos separados por recurso.

## Experiência e telas

O fluxo deve permitir:

- Menu com o título “Xadrez Medieval”, a frase “Dois reinos disputam um só tabuleiro. Capture o rei inimigo com um xeque-mate.” e acesso a Duelo, Jogar contra Bot, Regras e Aprenda a Jogar.
- Duelo local para duas pessoas no mesmo dispositivo.
- Partida contra bot com níveis Fácil, Médio e Difícil.
- Introdução opcional e curta antes da partida.
- Tela de jogo com tabuleiro, placares, turno, acesso às regras, reinício e retorno ao menu.
- Telas de vitória e derrota com opções para jogar novamente ou voltar ao menu.
- Transições breves entre telas.

## Identidade visual

Use uma estética medieval e fantástica: madeira, pedra, metal, pergaminho, castelos, bandeiras, sombras e detalhes dourados. Diferencie claramente os reinos: o Branco usa pedra clara, dourado e luz; o Negro usa tons escuros, ferro, vermelho escuro e iluminação sombria. O ambiente pode reagir a xeque, xeque-mate e outros momentos importantes.

O tabuleiro deve ter 8 × 8 casas e manter a orientação tradicional (`a8` a `h1`). As peças devem ser legíveis, proporcionais às casas e ter aparência de profundidade. A interface deve se adaptar a telas diferentes e indicar visualmente seleção, movimentos possíveis, turno, xeque e fim da partida.

## Regras e partida

Implemente as regras tradicionais: movimentos e capturas de todas as peças, primeiro avanço duplo do peão, promoção, roque, en passant, xeque, xeque-mate e empate. Não permita jogadas ilegais nem movimentos que deixem o próprio rei em xeque. As brancas começam e os turnos alternam.

Mantenha um estado central que inclua, no mínimo, tabuleiro, turno, modo, dificuldade do bot, peças capturadas, direitos de roque, alvo en passant e situação da partida. Atualize capturas e pontuação corretamente (peão 1, cavalo 3, bispo 3, torre 5, dama 9; rei sem valor numérico). Ao reiniciar, restaure todo o estado, incluindo dados do bot e regras especiais.

Durante uma animação de movimento, impeça outra jogada. Capturas removem a peça capturada e atualizam o estado e o placar. Xeque deve receber destaque visual; xeque-mate deve encerrar a partida e apresentar o resultado.

## Bot

Os níveis devem escolher apenas jogadas legais e ter comportamentos distintos:

- **Fácil:** jogadas relativamente aleatórias, capturas ocasionais e pouca análise. Mensagem: “O adversário ainda está aprendendo...”.
- **Médio:** prioriza capturas vantajosas, protege peças e reconhece ameaças simples. Mensagem: “O reino inimigo está analisando o tabuleiro.”
- **Difícil:** busca mais profunda; prefira minimax com poda alpha-beta e avaliação de material, segurança do rei, mobilidade e controle do centro. Mensagem: “O adversário está calculando sua próxima jogada.”

O bot só joga no próprio turno. Ao receber a jogada humana, verifique o estado da partida, mostre a mensagem de pensamento, calcule e execute uma jogada legal, atualize a interface e devolva o turno ao jogador.

## Regras, aprendizado e conteúdo

A tela de regras explica objetivo, xeque, xeque-mate, movimentos das peças, roque, promoção, en passant e empate em linguagem simples. Apresente também a função de Rei, Dama, Torre, Bispo, Cavalo e Peão, usando imagens disponíveis quando houver.

Em “Aprenda a Jogar”, permita selecionar uma peça para ver seu nome, função, explicação e movimentos possíveis, de preferência com um pequeno tabuleiro de demonstração.

Inclua ao menos um easter egg relacionado ao tema para Melanie Martinez, um para Zelda, um para Pokémon e um com cada nome de desenvolvedor: Isadora, Nicolas e Yasmin. Segredos não podem interferir na partida normal.

## Imagens, animação e áudio

Use somente caminhos e nomes que existam em `imgs/`; não suponha que já existam imagens de cada cor ou variante de peça. As imagens atualmente fornecidas são referências visuais e ficam organizadas em `refimgs/` por tema: `pecas/`, `interface/` e `cenarios/`. Não use referências diretamente no jogo, a menos que sejam designadas como assets.

Movimentos, capturas, xeque, resultados e interações de menu podem ter feedback visual e sonoro. Se houver música ou sons, ofereça controle de volume ou opção para silenciar. Animações devem ser breves, não bloquear a usabilidade e respeitar `prefers-reduced-motion`.

## Cuidados de implementação

- Preserve acessibilidade básica: foco visível, controles identificáveis e estados compreensíveis.
- Evite jogadas simultâneas, jogadas do bot no turno humano, partidas que continuem após o xeque-mate e dados antigos após reinício.
- Mantenha HTML para estrutura, CSS para apresentação e JavaScript para lógica e estado.
- Priorize, nesta ordem: regras corretas, usabilidade, comportamento distinto do bot, feedback visual/sonoro, identidade medieval, reações do ambiente e extras.
