# Drones de resgate

Simulador interativo de drones de busca e resgate que escolhem onde voar
maximizando a informação de Fisher sobre a posição de uma pessoa perdida.

O app tem quatro abas:

- **Posicionamento ótimo**: arraste a pessoa e os drones. O gradiente projetado com busca de Armijo leva os drones ao arranjo que maximiza log det F, com condições de KKT, elipse de Cramér-Rao e multistart para escapar de ótimos locais.
- **Missão de busca**: a posição da pessoa é desconhecida. A cada rodada os drones medem, estimam a posição por máxima verossimilhança (Gauss-Newton, que aqui é o Fisher scoring) e replanejam o voo.
- **Comparação**: Monte Carlo entre estratégias de voo ou entre quantidades de drones lançados.
- **Teoria**: modelo, derivações e ligação com a disciplina.

A interface oferece tema automático, claro ou escuro e três paletas de cores
(Resgate, Oceano e Floresta). A preferência fica salva no navegador e o layout
se adapta a celulares, tablets e desktops.

## Rodar localmente

Requer Node.js 18 ou mais recente.

```bash
npm install
npm run dev       # servidor de desenvolvimento em http://localhost:5173
npm test          # verificações numéricas do modelo
npm run build     # gera a versão estática em dist/
npm run preview   # serve o conteúdo de dist/ para conferir
```

## Publicar no GitHub Pages

1. Crie um repositório vazio no GitHub e envie este código para a branch `main`:

   ```bash
   git remote add origin https://github.com/SEU-USUARIO/drones-de-resgate.git
   git push -u origin main
   ```

2. No repositório, abra **Settings → Pages** e, em **Source**, escolha **GitHub Actions**.
3. O workflow em `.github/workflows/deploy.yml` roda os testes, gera o build e publica o site a cada push na `main`. O endereço aparece na aba **Actions** e fica parecido com `https://SEU-USUARIO.github.io/drones-de-resgate/`.

O `vite.config.js` usa `base: './'`, então o build funciona em qualquer subpasta. Também dá para hospedar a pasta `dist/` em Netlify, Vercel ou qualquer servidor estático.

## Estrutura

```
index.html            marcação das quatro abas
src/core.js           matemática: modelo RSSI, Fisher, gradiente, otimização, estimação
src/main.js           interface: mapas em canvas, gráficos, interação e animação
src/style.css         estilos (temas, paletas e responsividade)
scripts/verificar.js  testes numéricos (gradiente × diferenças finitas, ótimo analítico, Gauss-Newton)
```

## Modelo

Cada drone mede a potência do sinal do celular com o modelo de perda de percurso
log-distância, `y = P0 − 10 η log10(d) + ε`, com `d² = ‖p − q‖² + h²` e ruído gaussiano.
A informação de Fisher de cada medição é `k · v vᵀ / (‖v‖² + h²)²`, com `v = p − q`.
O critério D-ótimo maximiza `log det F`, o que minimiza a área da elipse de confiança.
Detalhes na aba Teoria.

Limitações: o sinal real de celular sofre sombreamento, multipercurso e variação de antena,
e é bem mais ruidoso que o modelo. Cramér-Rao é um limite assintótico.
