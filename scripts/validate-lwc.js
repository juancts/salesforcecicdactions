const { execSync } = require("child_process");
const FindFolder = require("node-find-folder");

function shouldRunLocalTests() {
  let findFolderResult = new FindFolder(`__tests__`);

  return findFolderResult.length > 0 ? true : false;
}

function areThereLwcComponents() {
  let findFolderResult = new FindFolder(`lwc`);

  return findFolderResult.length > 0 ? true : false;
}

function main() {
  //Comprobación de ejecución de tests locales
  if (shouldRunLocalTests()) {
    console.log("Ejecutando tests LWC");
    execSync("npm run test:lwc");
  } else {
    console.log(
      "Saltando ejecución de tests LWC. No se han localizado tests jest en el directorio"
    );
  }
  //Comprobación de ejecución de lint
  if (areThereLwcComponents()) {
    console.log("Ejecutando eslint");
    execSync("npm run lint");
  } else {
    console.log(
      "Saltando validación eslint, no se han localizado componentes en el directorio"
    );
  }
}

main();
