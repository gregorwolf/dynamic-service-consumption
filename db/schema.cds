namespace customizing;

using {cuid} from '@sap/cds/common';

@assert.unique: {name: [name], }
entity Service : cuid {
    name        : String  @(title: '{i18n>Name}');
    destination : String  @(title: '{i18n>Destination}');
    path        : String  @(title: '{i18n>Path}');
    active      : Boolean @(title: '{i18n>Active}');
    kind        : String  @(title: '{i18n>Kind}');
    openapi     : String  @(title: '{i18n>OpenAPI}');
}
