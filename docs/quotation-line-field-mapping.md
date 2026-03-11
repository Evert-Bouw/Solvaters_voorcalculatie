# QuotationLine veldmapping

Bron van waarheid:
- backend endpoint: `/api/quotation-line-field-mappings`

Doel:
- elk regelniveau-veld in de app heeft een vaste `appFieldId`
- per veld is vastgelegd hoe dit richting AFAS gaat
- vrije opslagkolommen gebruiken hun `AFAS ID` uit instellingen

Belangrijk:
- deze tabel beschrijft de bedoelde en deels al bekende mapping
- de daadwerkelijke write voor voorcalculatieregels naar AFAS is nog niet aangesloten
- velden met `afasMode = unknown` moeten nog definitief bevestigd worden met AFAS metainfo of connector-documentatie
- POST/PUT/DELETE op regelniveau lopen via `KnQuotation`, met daaronder `Objects[] -> KnQuotationLine`

Wrapperstructuur:

```json
{
  "KnQuotation": {
    "Element": {
      "@QuId": "000001",
      "Objects": [
        {
          "KnQuotationLine": {
            "Element": {
              "Fields": {
                "PrSt": "F001",
                "VaIt": "1",
                "ItCd": "ART-001",
                "Ds": "Omschrijving"
              }
            }
          }
        }
      ]
    }
  }
}
```

Voorbeelden:

| appFieldId | appStorageKey | AFAS |
| --- | --- | --- |
| `QL-QUOTATION_ID` | `quotationId` | `KnQuotation.Element.@QuId` |
| `QL-STAGE_ID` | `stageId` | `KnQuotationLine.Fields.PrSt` |
| `QL-SUPPLIER_ID` | `supplierId` | `KnQuotationLine.Fields.U69BD7B0B402F2007FEC9E485BB4B59C9` |
| `QL-QTY_BASE` | `baseQty` | nog te koppelen |
| `QL-QTY_FINAL` | `computedQty` | `KnQuotationLine.Fields.QuUn` |
| `QL-UNIT` | `unit` | `KnQuotationLine.Fields.UnId` |
| `QL-UNIT_COST_BASE` | `unitCost` | nog te koppelen |
| `QL-UNIT_COST_FINAL` | `computedUnitCost` | `KnQuotationLine.Fields.AmCo` |
| `QL-UNIT_PRICE_BASE` | `unitPrice` | nog te koppelen |
| `QL-UNIT_PRICE_FINAL` | `computedUnitPrice` | `KnQuotationLine.Fields.Upri` |
| `QL-LINE_TYPE` | `lineType` | `KnQuotationLine.Fields.VaIt` |
| `QL-ITEM_CODE` | `itemCode` | `KnQuotationLine.Fields.ItCd` |
| `QL-DESCRIPTION` | `description` | `KnQuotationLine.Fields.Ds` |
| `QL-MARKUP-M1` | `markupM1` | `KnQuotationLine.Fields.<AFAS ID uit settings>` |

Gebruik:
1. Vul per vrije opslagkolom een `AFAS ID` in bij instellingen.
2. Lees de actuele mapping uit via `/api/quotation-line-field-mappings`.
3. Gebruik deze tabel als basis voor de updateconnector-write van `KnQuotationLine`.
