## GitHub Actions

De primaire setuphandleiding staat in [GITHUB_SETUP_SOLVATERS.md](/c:/Users/EvertBouwSolvatersBV/Downloads/Solvaters_voorcalculatie/GITHUB_SETUP_SOLVATERS.md).

Deze map volgt nu dezelfde opzet als de basisrepo:

- gedeelde `core` workflows voor build/deploy
- dunne app-wrappers voor infra, backend en frontend

Belangrijkste workflows:

- [.github/workflows/build-manual.yml](/c:/Users/EvertBouwSolvatersBV/Downloads/Solvaters_voorcalculatie/.github/workflows/build-manual.yml)
- [.github/workflows/core-change-notice.yml](/c:/Users/EvertBouwSolvatersBV/Downloads/Solvaters_voorcalculatie/.github/workflows/core-change-notice.yml)
- [.github/workflows/core-deploy-infra.yml](/c:/Users/EvertBouwSolvatersBV/Downloads/Solvaters_voorcalculatie/.github/workflows/core-deploy-infra.yml)
- [.github/workflows/core-deploy-backend.yml](/c:/Users/EvertBouwSolvatersBV/Downloads/Solvaters_voorcalculatie/.github/workflows/core-deploy-backend.yml)
- [.github/workflows/core-deploy-frontend.yml](/c:/Users/EvertBouwSolvatersBV/Downloads/Solvaters_voorcalculatie/.github/workflows/core-deploy-frontend.yml)
- [.github/workflows/deploy-infra.yml](/c:/Users/EvertBouwSolvatersBV/Downloads/Solvaters_voorcalculatie/.github/workflows/deploy-infra.yml)
- [.github/workflows/deploy-backend.yml](/c:/Users/EvertBouwSolvatersBV/Downloads/Solvaters_voorcalculatie/.github/workflows/deploy-backend.yml)
- [.github/workflows/deploy-frontend.yml](/c:/Users/EvertBouwSolvatersBV/Downloads/Solvaters_voorcalculatie/.github/workflows/deploy-frontend.yml)

Minimale rechten voor de GitHub deployment identity:

- `Contributor` op de doel-resourcegroep
- `Administrator voor gebruikerstoegang` of gelijkwaardig op de gebruikte Key Vault of bovenliggende scope, zodat Bicep de Web App identity rollen kan geven
