<img src="assets/icon.svg" width="64" height="64" alt="">

# ferias

Planejador de férias para o Brasil: mostra o calendário de um período longo com fins de semana, feriados nacionais, estaduais e municipais e pontos facultativos, e calcula dias ganhos e perdidos de cada período de férias.

## Rodar

```sh
npm install
npm run dev
```

`npm run build` gera o site em `dist/`. O deploy no GitHub Pages roda pelo workflow `.github/workflows/deploy.yml` a cada push na `main`.

## Dados

`public/data/` é gerado a partir do [feriados-brasil](https://github.com/joaopbini/feriados-brasil) (MIT):

```sh
npm run data
```

O script converte as datas de 2026 em regras (data fixa, relativa à Páscoa ou transferida para domingo), que o app projeta para qualquer ano.
