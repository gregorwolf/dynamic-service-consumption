const cds = require("@sap/cds");
const { executeHttpRequest } = require("@sap-cloud-sdk/http-client");
const { edmx2csn } = require("@sap/cds-dk/lib/import/odata");
const LOG = cds.log("dynamic");

class CustomizingService extends cds.ApplicationService {
  async init() {
    const db = await cds.connect.to("db");
    const { Service } = db.entities("customizing");

    this.on("loadServices", async (req) => {
      const services = await db.read(Service).where({ active: true });
      for (let i = 0; i < services.length; i++) {
        const service = services[i];
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
          kind: "odata",
          model: csn,
          credentials: { destination: service.destination, path: service.path },
        });
        // Reflect Service and iterate through Entities reading the first entry
        const m = cds.linked(csn);
        console.log("Service", m.services);
        console.log("Entities", m.entities);
        for (let d of m.each("entity")) {
          console.log(d.kind, d.name);
          let query;
          if (d["@odata.singleton"]) {
            // TODO: find correct query for singleton
          } else {
            try {
              query = SELECT.from(d.name).limit(1);
              const result = await serviceConnection.run(query);
              console.log(result);
            } catch (error) {
              console.log(error);
            }
          }
        }
        console.log("Operations", m.operations);
        // Run only for CatalogService
        if (m.services[0].name === "CatalogService") {
          // Read existing Orders
          const orders = await serviceConnection.get("Orders");
          LOG.info(`Found ${orders.length} orders`);
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
          LOG.info(order);
          const orders2 = await serviceConnection.get("Orders");
          LOG.info(`Found ${orders2.length} orders`);
        }
      }
      return services;
    });

    return super.init();
  }
}

module.exports = { CustomizingService };
