const cds = require("@sap/cds");
const { executeHttpRequest } = require("@sap-cloud-sdk/http-client");
const { edmx2csn } = require("@sap/cds-dk/lib/import/odata");
const { openAPI2csn } = require("@sap/cds-dk/lib/import/openapi");
const LOG = cds.log("dynamic");

class CustomizingService extends cds.ApplicationService {
  async init() {
    const db = await cds.connect.to("db");
    const { Service } = db.entities("customizing");

    this.on("loadServices", async (req) => {
      // Read all active services
      const services = await db.read(Service).where({ active: true });
      for (let i = 0; i < services.length; i++) {
        const service = services[i];
        if (service.kind === "odata") {
          const metadataResponse = await executeHttpRequest(
            { destinationName: service.destination },
            { method: "GET", url: `${service.path}$metadata` }
          );
          const metadata = metadataResponse.data;
          // REVISIT: Can we also get CDS back?
          const csn = await edmx2csn(metadata, service.name, {
            odataVersion: "V2",
          });
          LOG.debug(csn);
          const serviceConnection = await cds.connect.to(service.name, {
            kind: service.kind,
            model: csn,
            credentials: {
              destination: service.destination,
              path: service.path,
            },
          });
          // Reflect Service and iterate through Entities reading the first entry
          const m = cds.linked(csn);
          LOG._info && LOG.info("Service", m.services);
          LOG._info && LOG.info("Entities", m.entities);
          for (let d of m.each("entity")) {
            LOG._info && LOG.info(d.kind, d.name);
            let query;
            if (d["@odata.singleton"]) {
              // TODO: find correct query for singleton
            } else {
              try {
                query = SELECT.from(d.name).limit(1);
                const result = await serviceConnection.run(query);
                LOG._info && LOG.info(result);
              } catch (error) {
                LOG._info && LOG.info(error);
              }
            }
          }
          LOG._info && LOG.info("Operations", m.operations);
          // Run only for CatalogService
          if (m.services[0].name === "CatalogService") {
            // Read existing Orders
            const orders = await serviceConnection.get("Orders");
            LOG._info && LOG.info(`Found ${orders.length} orders`);
            // Create a new Order
            const order = await serviceConnection.post("Orders", {
              OrderNo: "42",
              CustomerOrderNo: "Order from bob",
              currency_code: "EUR",
              salesOrganization: "",
              Items: [],
              ShippingAddress: {
                street: "Hauptstraße 1",
                city: "Trostberg",
              },
            });
            LOG._info && LOG.info(order);
            const orders2 = await serviceConnection.get("Orders");
            LOG._info && LOG.info(`Found ${orders2.length} orders`);
          }
        } else if (service.kind === "rest") {
          const openapiResponse = await executeHttpRequest(
            { destinationName: service.destination },
            { method: "GET", url: `${service.openapi}` }
          );
          LOG._trace && LOG.trace(openapiResponse.data);
          const openapi = openapiResponse.data;
          const csn = await openAPI2csn(JSON.stringify(openapi));
          LOG._trace && LOG.trace(csn);
          const serviceConnection = await cds.connect.to(service.name, {
            kind: service.kind,
            model: csn,
            credentials: {
              destination: service.destination,
              path: service.path,
            },
          });
          const m = cds.linked(csn);
          LOG._trace && LOG.trace("Service", m.services);
          LOG._trace && LOG.trace("Definitions", m.definitions);
          // loop through all objects in definitions
          for (const [key, value] of Object.entries(m.definitions)) {
            LOG._trace && LOG.trace(key, value);
            if (value.kind === "function") {
              if (key === "Swagger.Petstore.pet_findByStatus") {
                LOG._info && LOG.info(key);
                LOG._info && LOG.info(value);
                // Call the function
                const result = await serviceConnection.send({
                  method: "GET",
                  path: value["@openapi.path"] + "?status=available",
                });
                LOG._info && LOG.info(result);
              }
            }
          }
        }
      }
      return services;
    });

    return super.init();
  }
}

module.exports = { CustomizingService };
