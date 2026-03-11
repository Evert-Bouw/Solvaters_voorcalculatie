## GitHub Actions

De primaire setuphandleiding staat in [GITHUB_SETUP_SOLVATERS.md](/c:/Users/EvertBouwSolvatersBV/Downloads/Solvaters_voorcalculatie/GITHUB_SETUP_SOLVATERS.md).

Deze map bevat alleen de technische workflow:

- [.github/workflows/deploy.yml](/c:/Users/EvertBouwSolvatersBV/Downloads/Solvaters_voorcalculatie/.github/workflows/deploy.yml)

De workflow:

- logt in op Azure via OIDC
- rolt infra uit via Bicep
- deployt backend en frontend

Minimale rechten voor de GitHub deployment identity:

- `Contributor` op de doel-resourcegroep
- `Administrator voor gebruikerstoegang` of gelijkwaardig op de gebruikte Key Vault of bovenliggende scope, zodat Bicep de Web App identity rollen kan geven
