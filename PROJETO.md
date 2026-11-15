# Xadrez Medieval — especificação completa

Este documento reúne a especificação extraída do PDF original. A organização atual das referências visuais está em `refimgs/pecas/`, `refimgs/interface/` e `refimgs/cenarios/`; `imgs/` fica reservada para assets finais usados pelo jogo.

## 1. Objetivo do projeto
Desenvolver um jogo de Xadrez Medieval utilizando HTML, CSS e JavaScript, com uma
identidade visual medieval/fantástica, trazendo a sensação de que o tabuleiro representa uma
batalha entre dois reinos.

O projeto deve possuir:

Tela inicial;
Sistema de navegação;
Modo Duelo para dois jogadores;
Modo Jogar contra Bot;
Três níveis de dificuldade para o Bot;
Tabuleiro funcional de xadrez;
Todas as regras tradicionais do xadrez;
Peças personalizadas;
Peças com aparência 3D;
Animações de movimento;
Efeitos sonoros;
Sistema de pontuação;
Tela de regras;
Explicação da função de cada peça;
Sistema de vitória e derrota;
Botão de reinício;
Botão para voltar ao menu;
Transições entre telas;
Ambiente que reage aos acontecimentos da partida;
Pequenas características individuais para as peças;
Personalidade diferente para cada dificuldade do Bot;
Easter eggs;
Modo de aprendizado das peças.

A experiência deve passar a sensação de que o jogador não está apenas jogando xadrez, mas
participando de uma batalha entre dois reinos.

## 2. Estrutura dos arquivos
A estrutura deve ser simples, mantendo um único arquivo HTML, um único arquivo CSS e um
único arquivo JavaScript.
XadrezMedieval/
│
├── basexadrez.html
├── style.css
├── script.js
│
├── imgs/
│ ├── fundo.png
│ ├── moldura.png
│ ├── titulo.png
│ ├── tabuleiro.png
│ ├── PeaoBranco1.png
│ ├── PeaoBranco2.png
│ ├── ...
│
└── refimgs/
├── referenciahomepage.png
├── imagem1.png
├── imagem2.png
├── ...
HTML
O arquivo principal será:

basexadrez.html

Ele deve conter todas as telas e seções do projeto dentro do mesmo HTML, podendo utilizar
elementos como:

<section id="menu">

<section id="dificuldade">

<section id="jogo">

<section id="regras">

<section id="resultado">
As diferentes telas serão controladas pelo JavaScript, sem necessidade de criar vários arquivos
HTML.

CSS
Todo o estilo do projeto deverá ficar em:

style.css

O arquivo poderá ser organizado internamente por seções, por exemplo:

/* MENU */
/* TELA DE DIFICULDADE */
/* TABULEIRO */
/* PEÇAS */
/* ANIMAÇÕES */
/* REGRAS */
/* RESULTADO */
/* RESPONSIVIDADE */

JavaScript
Toda a lógica do projeto deverá ficar em:

script.js

O JavaScript poderá ser organizado internamente em funções e blocos responsáveis por:

navegação;
tabuleiro;
movimentação;
regras;
turnos;
capturas;
pontuação;
Bot;
animações;
sons;
vitória;
derrota;
reinício;
easter eggs;
modo de aprendizado.
Não criar arquivos JavaScript separados para cada função.

Imagens
A pasta:

imgs/

será utilizada para armazenar as imagens que realmente serão utilizadas no site.

A pasta:

refimgs/

será utilizada para armazenar as imagens de referência do projeto.

As imagens de referência devem ser analisadas antes da implementação para que o resultado
visual seja o mais próximo possível do que foi solicitado.

## 3. Arquivo base
Utilizar:

basexadrez.html

como arquivo base do projeto.

Caso já exista código funcional nesse arquivo, preservar o que já estiver funcionando e realizar
as alterações necessárias sem remover funcionalidades importantes.

A divisão entre HTML, CSS e JavaScript deve permanecer externa:

basexadrez.html
style.css
script.js

## 4. Identidade visual
O jogo deve possuir uma identidade visual medieval, fantástica e relacionada a uma batalha
entre dois reinos.

A estética deve utilizar elementos como:
madeira;
pedra;
metal;
pergaminho;
castelos;
iluminação dramática;
sombras;
tochas;
bandeiras;
arquitetura medieval;
detalhes dourados;
elementos de guerra;
profundidade;
aparência tridimensional.

A interface deve parecer parte de um universo medieval, e não simplesmente um site comum
contendo um tabuleiro de xadrez.

## 5. Os dois reinos
O jogo deve representar dois reinos diferentes.

Reino Branco
O Reino Branco deve possuir uma identidade relacionada a:

pedra clara;
dourado;
luz;
bandeiras claras;
castelo;
iluminação mais clara;
aparência mais nobre e solene.

Reino Negro
O Reino Negro deve possuir uma identidade relacionada a:

pedra escura;
ferro;
tons escuros;
vermelho escuro;
tochas;
arquitetura mais pesada;
iluminação mais sombria.
A diferença visual entre os dois reinos deve ser perceptível durante a partida.

## 6. Pequena história do jogo
A história não precisa ser extremamente longa.

A ideia é apresentar que:

Dois reinos estão em guerra e o tabuleiro representa o campo de batalha.

Cada peça representa uma função dentro do exército do seu reino.

O objetivo é derrotar o rei inimigo através de um xeque-mate.

## 7. Tela inicial
A tela inicial deve seguir como referência:

referenciahomepage.png

Ela deve possuir:

fundo medieval;
imagem de fundo;
movimento da imagem no eixo X;
moldura estática;
título em destaque;
profundidade;
iluminação;
elementos visuais semelhantes às referências fornecidas.

O título deve ser:

Xadrez Medieval

Caso exista uma imagem específica para o título, utilizar a imagem fornecida.

A frase:

Dois reinos disputam um só tabuleiro. Capture o rei inimigo com um xeque-mate.

deve permanecer na tela inicial.

A tela deve possuir os botões:

DUELO
JOGAR CONTRA BOT

Também deve existir acesso às regras.

## 8. Botões da tela inicial
DUELO
Ao clicar em:

DUELO

o jogador deve entrar no modo para duas pessoas.

O jogo deve abrir uma nova tela/seção com uma animação de transição.

Os dois jogadores utilizam o mesmo dispositivo.

O jogador das peças brancas começa.

JOGAR CONTRA BOT
Ao clicar em:

JOGAR CONTRA BOT

devem aparecer três opções:

Fácil;
Médio;
Difícil.

O jogador selecionará o nível antes de iniciar a partida.

## 9. Transições
As transições entre as telas devem possuir uma pequena animação.

Podem ser utilizadas:

fade;
escurecimento;
movimento;
zoom;
mudança de iluminação.
As transições não devem ser longas demais.

A intenção é dar sensação de passagem para outro ambiente, como se o jogador estivesse
entrando no campo de batalha.

## 10. Introdução da partida
Antes de iniciar a partida, pode existir uma pequena introdução mostrando algo como:

DOIS REINOS

e depois:

REINO BRANCO VS REINO NEGRO

Essa introdução deve ser curta e pode possuir animação e som.

O jogador deve poder ignorá-la caso necessário.

## 11. Tela de jogo
A tela de jogo deve possuir:

background medieval;
tabuleiro;
peças;
placar das peças brancas;
placar das peças pretas;
indicador de turno;
botão de reinício;
botão para voltar ao menu;
acesso às regras.

Também devem existir elementos visuais relacionados aos dois reinos.

## 12. Tabuleiro
O tabuleiro deve possuir:

8 × 8

totalizando:
64 casas

As posições internas devem seguir a organização tradicional do xadrez:

a8 b8 c8 d8 e8 f8 g8 h8
a7 b7 c7 d7 e7 f7 g7 h7
a6 b6 c6 d6 e6 f6 g6 h6
a5 b5 c5 d5 e5 f5 g5 h5
a4 b4 c4 d4 e4 f4 g4 h4
a3 b3 c3 d3 e3 f3 g3 h3
a2 b2 c2 d2 e2 f2 g2 h2
a1 b1 c1 d1 e1 f1 g1 h1

O tabuleiro deve manter corretamente a posição das peças.

## 13. Imagens das peças
Todas as peças devem utilizar as imagens fornecidas.

As imagens devem ser organizadas de acordo com a cor.

Exemplo:

PeaoBranco1
PeaoBranco2
...
RainhaBranca
ReiBranco
TorreBranca
BispoBranco
CavaloBranco

e:

PeaoPreto1
PeaoPreto2
...
RainhaPreta
ReiPreto
TorrePreta
BispoPreto
CavaloPreto
Os nomes utilizados no código devem corresponder aos nomes reais dos arquivos presentes na
pasta imgs.

## 14. Peças em 3d
As peças devem possuir aparência tridimensional.

Quando uma peça for selecionada para movimentação, deve ocorrer uma pequena animação
de:

## 1. Levantar a peça;

## 2. Movimentá-la;

## 3. Colocá-la novamente sobre o tabuleiro.

Enquanto a animação estiver acontecendo, o jogador não deve conseguir iniciar outra
movimentação.

## 15. Identidade das peças
As peças podem possuir pequenas informações ao passar o mouse ou selecionar uma delas.

Exemplos:

RAINHA — A soberana do reino.

TORRE — Guardiã das muralhas.

CAVALO — Especialista em ataques inesperados.

BISPO — Estrategista do reino.

PEÃO — O soldado que avança pelo reino.

REI — A peça que deve ser protegida a qualquer custo.

Essas informações devem ser pequenas e não atrapalhar a partida.

## 16. Movimentação das peças
Ao clicar em uma peça:

ela deve ser selecionada;
suas casas possíveis devem ser destacadas;
o jogador deve visualizar onde pode movimentá-la.
Ao clicar em uma casa válida:

a peça deve se movimentar;
a animação deve ser executada;
o turno deve mudar.

Ao clicar em uma casa inválida:

a peça não deve se movimentar.

O sistema deve impedir movimentos que não sejam permitidos pelas regras do xadrez.

## 17. Captura de peças
Quando uma peça capturar outra:

a peça capturada deve desaparecer do tabuleiro;
deve ocorrer uma pequena animação;
deve ser reproduzido um efeito sonoro;
o placar deve ser atualizado;
a peça capturada deve ser registrada no estado da partida.

## 18. Tabuleiro e ambiente reagindo à
PARTIDA
O ambiente deve reagir a acontecimentos importantes da partida.

Xeque
Quando um rei estiver em xeque:

o rei deve receber destaque visual;
pode ocorrer uma mudança sutil na iluminação;
pode aparecer um aviso;
pode ser reproduzido um som de alerta.

Situação de perigo
Quando uma situação importante ocorrer, podem existir pequenas mudanças visuais no
ambiente, como:

partículas;
alteração de iluminação;
brilho;
pequenas mudanças no cenário.

Xeque-mate
Quando ocorrer xeque-mate:

o ambiente deve mudar de iluminação;
o rei vencedor pode receber destaque;
deve ocorrer uma animação especial;
deve ser reproduzido um som específico.

## 19. Efeitos sonoros
O jogo deve possuir efeitos sonoros para ações importantes.

Exemplos:

movimentação;
captura;
xeque;
xeque-mate;
vitória;
derrota;
transições;
interação com menus.

Os sons devem ser utilizados para aumentar a sensação de batalha medieval.

## 20. Música e ambiente
O menu pode possuir uma música ambiente medieval.

Durante a partida, pode existir uma música diferente ou uma ambientação mais relacionada ao
campo de batalha.

Se possível, adicionar controle de volume ou opção para ativar/desativar o áudio.

## 21. Turnos
O Reino Branco começa a partida.

Os turnos devem alternar:
Branco    → Preto → Branco → Preto...
O jogador deve conseguir visualizar claramente de quem é a vez.

## 22. Regras do xadrez
O sistema deve implementar corretamente as regras tradicionais do xadrez.

Peão
movimenta-se para frente;
pode avançar duas casas em seu primeiro movimento;
captura diagonalmente;
pode realizar promoção.

Torre
Movimenta-se em linha reta:

horizontal;
vertical.

Cavalo
Movimenta-se em formato de:

L

O cavalo pode pular outras peças.

Bispo
Movimenta-se pelas diagonais.

Rainha
Movimenta-se:

horizontalmente;
verticalmente;
diagonalmente.
Rei
Movimenta-se uma casa por vez em qualquer direção.

## 23. Regras especiais
O jogo deve implementar:

roque;
en passant;
promoção do peão;
xeque;
xeque-mate;
empate.

O sistema deve impedir que um jogador faça um movimento que deixe seu próprio rei em
xeque.

## 24. Sistema de pontuação
Cada jogador deve possuir um placar relacionado às peças capturadas.

Valores:

Peão = 1
Cavalo = 3
Bispo = 3
Torre = 5
Rainha = 9
Rei = sem valor numérico

O placar deve ser atualizado automaticamente após cada captura.

Também pode mostrar visualmente quais peças foram capturadas.

## 25. Bot
O jogo deve possuir três níveis:

Fácil;
Médio;
Difícil.
Cada nível deve possuir um comportamento diferente.

## 26. Bot fácil
O Bot Fácil deve possuir um comportamento mais simples.

Ele deve:

escolher movimentos legais;
realizar movimentos relativamente aleatórios;
realizar capturas ocasionalmente;
cometer erros;
não analisar profundamente o tabuleiro.

Mensagem de personalidade:

O adversário ainda está aprendendo...

## 27. Bot médio
O Bot Médio deve:

procurar capturas vantajosas;
proteger peças;
identificar ameaças simples;
analisar algumas jogadas futuras;
evitar erros muito óbvios.

Mensagem:

O reino inimigo está analisando o tabuleiro.

## 28. Bot difícil
O Bot Difícil deve utilizar uma lógica muito mais avançada.

Idealmente, utilizar:

minimax;
alpha-beta pruning;
avaliação de material;
segurança do rei;
mobilidade;
controle do centro;
ameaças;
xeques;
vantagem posicional.

Mensagem:

O adversário está calculando sua próxima jogada.

O objetivo é fazer com que os três níveis realmente tenham comportamentos diferentes.

## 29. Personalidade do bot
Além da diferença de dificuldade, cada Bot deve possuir pequenas mensagens relacionadas ao
seu comportamento.

Fácil
O adversário ainda está aprendendo...

Médio
O reino inimigo está analisando o tabuleiro.

Difícil
O adversário está calculando sua próxima jogada.

Essas mensagens podem aparecer enquanto o Bot estiver pensando.

## 30. Funcionamento do bot
Depois que o jogador realizar sua jogada:

## 1. Verificar se a partida terminou;

## 2. Alterar o turno;

## 3. Mostrar que o bot está pensando;

## 4. Calcular a jogada;

## 5. Escolher a jogada;

## 6. Executar a animação;

## 7. Reproduzir o som;

## 8. Atualizar o tabuleiro;

## 9. Atualizar o placar;

## 10. Verificar xeque;

## 11. Verificar xeque-mate;

## 12. Devolver o turno ao jogador.

## 31. Tela de vitória
Quando ocorrer xeque-mate, deve aparecer uma tela especial.

Exemplo:

♔ XEQUE-MATE

O REINO BRANCO VENCEU

A tela deve possuir:

animação;
partículas;
símbolo do reino vencedor;
iluminação especial;
efeito sonoro;
botão para jogar novamente;
botão para retornar ao menu.

## 32. Tela de derrota
Quando o jogador perder:

XEQUE-MATE

O REINO NEGRO VENCEU

A tela deve possuir uma identidade visual diferente da vitória, podendo utilizar uma iluminação
mais escura.

Também deve possuir:

botão para jogar novamente;
botão para voltar ao menu.

## 33. Easter eggs
O jogo pode possuir pequenos segredos escondidos.

Exemplos:

clicar várias vezes no título e então aparecerá algo relacionado a esse tema, uma frase, uma
dica, pontuação, algum detalhe sobre a história dessa guerra e sobre seus soldados (isso
vale para o outros tópicos tambem, nao somente o ato de clicar várias vezes no título)
clicar em elementos específicos;
interagir com elementos escondidos;
ativar uma animação secreta;
mostrar uma mensagem especial;
alterar temporariamente algum elemento visual.

Os easter eggs não devem interferir na lógica normal do jogo.

Haver pelo menos uma referencia a Melanie Martinez, uma a Zelda e uma a pokemon que
esteja relacionado ao tema do jogo, nada fora do assunto. Haver também pelo menos um
easteregg com o nome dos desenvolvedores:

Isadora

Nicolas

Yasmin

## 34. Modo de aprendizado
Adicionar uma opção:

APRENDA A JOGAR

Nesse modo, o jogador poderá selecionar uma peça e aprender como ela funciona.

Ao selecionar uma peça:

mostrar uma pequena explicação;
mostrar o nome da peça;
mostrar sua função;
demonstrar seus movimentos.

Pode ser utilizado um pequeno tabuleiro de demonstração.

As casas possíveis devem ser destacadas.

Exemplo:

CAVALO

O cavalo se movimenta em formato de L e pode saltar outras peças.

## 35. Regras
Deve existir uma aba ou tela de regras.

Ela deve explicar:
objetivo do xadrez;
como funciona o xeque;
como funciona o xeque-mate;
como cada peça se movimenta;
roque;
promoção;
en passant;
empate.

As explicações devem ser simples e organizadas.

## 36. Função das peças
Também deve existir uma área específica explicando a função das peças.

Utilizar as imagens fornecidas para apresentar:

Rei;
Rainha;
Torre;
Bispo;
Cavalo;
Peão.

Cada peça deve possuir sua imagem e uma pequena explicação.

## 37. Reiniciar partida
O botão:

REINICIAR

deve reiniciar completamente a partida.

Deve:

restaurar o tabuleiro;
restaurar as peças;
zerar a pontuação;
limpar peças capturadas;
restaurar o turno para o Branco;
restaurar regras especiais;
reiniciar o estado do Bot quando necessário.

Pode existir uma confirmação antes de reiniciar:
Deseja realmente reiniciar a partida?

## 38. Voltar ao menu
O botão:

VOLTAR AO MENU

deve levar o jogador novamente para a tela inicial.

Pode existir uma confirmação:

Deseja sair da partida e voltar ao menu?

## 39. Fluxo de navegação
O fluxo principal deve ser:

MENU
↓
DUELO
↓
INTRODUÇÃO
↓
PARTIDA
↓
VITÓRIA / DERROTA

ou:

MENU
↓
JOGAR CONTRA BOT
↓
ESCOLHER DIFICULDADE
↓
INTRODUÇÃO
↓
PARTIDA
↓
VITÓRIA / DERROTA

Também deve ser possível acessar:
MENU
↓
REGRAS

e:

MENU
↓
APRENDA A JOGAR

## 40. Responsividade
O jogo deve funcionar corretamente em diferentes tamanhos de tela.

O tabuleiro deve permanecer proporcional.

Os elementos da interface não devem sair da tela.

Os botões devem continuar acessíveis.

As peças devem se adaptar ao tamanho das casas.

## 41. Acessibilidade e usabilidade
A interface deve ser clara.

Os elementos clicáveis devem possuir indicação visual.

Quando uma peça estiver selecionada, isso deve ser perceptível.

As casas possíveis devem possuir destaque.

O jogador deve saber:

de quem é a vez;
qual peça selecionou;
onde pode movimentá-la;
quando está em xeque;
quando a partida terminou.

## 42. Estado principal do jogo
O JavaScript deve manter um estado central da partida.
Exemplo:

board
currentTurn
gameMode
botDifficulty
capturedWhitePieces
capturedBlackPieces
whiteKingPosition
blackKingPosition
castlingRights
enPassantTarget
gameStatus

Essas informações devem ser atualizadas conforme a partida acontece.

## 43. Organização do código
Mesmo utilizando apenas um arquivo JavaScript, o script.js deve ser organizado de forma
clara.

Separar logicamente as funções em blocos, como:

NAVEGAÇÃO
ESTADO DO JOGO
TABULEIRO
PEÇAS
MOVIMENTAÇÃO
REGRAS
CAPTURAS
TURNOS
XEQUE
XEQUE-MATE
PONTUAÇÃO
BOT
ANIMAÇÕES
SONS
RESULTADO
EASTER EGGS
MODO DE APRENDIZADO

O mesmo deve ser feito no style.css, organizando os estilos por partes do projeto.

## 44. Separação de responsabilidades
HTML
Responsável pela estrutura:

telas;
botões;
tabuleiro;
elementos visuais;
placares;
textos;
imagens.

CSS
Responsável por:

cores;
tamanhos;
posições;
fontes;
efeitos;
sombras;
profundidade;
animações;
transições;
responsividade;
identidade medieval.

JavaScript
Responsável por:

navegação;
estado do jogo;
regras;
movimentação;
turnos;
capturas;
pontuação;
xeque;
xeque-mate;
Bot;
sons;
animações acionadas pela lógica;
vitória;
derrota;
reinício;
easter eggs;
modo de aprendizado.

## 45. Referências visuais
Antes de implementar, analisar todas as imagens presentes na pasta:

refimgs/

Essas imagens devem ser utilizadas como referência para:

composição;
cores;
proporções;
posicionamento;
estilo;
iluminação;
efeitos;
aparência geral.

As imagens de referência não devem necessariamente ser utilizadas diretamente no site, a
menos que sejam especificadas como imagens reais do projeto.

## 46. Prioridades do projeto
A implementação deve priorizar:

## 1. Funcionamento correto do xadrez

As regras e movimentações precisam funcionar corretamente.

## 2. Usabilidade

O jogador precisa entender facilmente como jogar.

## 3. Bot
Os três níveis devem apresentar comportamentos diferentes.

## 4. Animações e sons
Movimentações, capturas, xeques e resultados devem possuir feedback visual e sonoro.

## 5. Identidade medieval

O jogo precisa realmente parecer um xadrez medieval.

## 6. Reação do ambiente
O cenário deve reagir aos acontecimentos importantes da partida.

## 7. Extras

Easter eggs, modo de aprendizado e pequenas personalidades das peças devem complementar
o projeto sem prejudicar o funcionamento principal.

## 47. Tratamento de erros
O sistema deve evitar situações em que:

uma peça possa ser movimentada de maneira ilegal;
dois turnos ocorram ao mesmo tempo;
o Bot jogue durante o turno do jogador;
uma peça desapareça incorretamente;
o placar fique incorreto;
o jogo continue depois do xeque-mate;
o jogador consiga movimentar peças durante a animação;
uma partida antiga interfira em uma nova partida.

Ao reiniciar, todos os dados da partida anterior devem ser restaurados corretamente.

## 48. Experiência final esperada
O resultado final deve parecer um verdadeiro Xadrez Medieval, e não apenas um tabuleiro de
xadrez estilizado.

O jogador deve entrar em um ambiente onde:

existem dois reinos;
cada lado possui identidade própria;
as peças representam personagens do exército;
o tabuleiro funciona como campo de batalha;
as peças possuem aparência 3D;
os movimentos possuem animação;
as capturas possuem efeitos;
o ambiente reage ao jogo;
o Bot possui diferentes níveis e personalidades;
o xeque e o xeque-mate possuem impacto visual e sonoro;
existem telas de vitória e derrota;
existem regras e modo de aprendizado;
existem pequenos segredos espalhados pelo jogo.

O projeto deve utilizar:

basexadrez.html
style.css
script.js
imgs/
refimgs/

mantendo a divisão entre HTML, CSS e JavaScript externos, mas sem separar a aplicação em
vários arquivos HTML, CSS ou JavaScript.
