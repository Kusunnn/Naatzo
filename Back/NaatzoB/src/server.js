require("./config/env");

const { app } = require("./app");
const { port } = require("./config/env");

app.listen(port, () => {
  console.log(`Naatzo backend listo en http://localhost:${port}`);
});
