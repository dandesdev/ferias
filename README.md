<img src="assets/icon.svg" width="64" height="64" alt="">

# ferias

Planejador de férias para o Brasil: mostra o calendário de um período longo com fins de semana, feriados nacionais, estaduais e municipais e pontos facultativos, e calcula dias ganhos e perdidos de cada período de férias.

## Rodar

Site estático, sem build:

```sh
python -m http.server 5180
```

Abra http://localhost:5180.

## Dados

`data/` é gerado a partir do [feriados-brasil](https://github.com/joaopbini/feriados-brasil) (MIT):

```sh
node scripts/build-data.mjs
```

O script converte as datas de 2026 em regras (data fixa, relativa à Páscoa ou transferida para domingo), que o app projeta para qualquer ano.
