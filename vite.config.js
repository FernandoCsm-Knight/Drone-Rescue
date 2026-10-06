import { defineConfig } from 'vite';

// base: './' gera caminhos relativos, então o build funciona em qualquer
// subpasta (por exemplo, https://usuario.github.io/nome-do-repositorio/).
export default defineConfig({
  base: './',
});
