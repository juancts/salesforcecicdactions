import { execSync } from "child_process";
import { Console } from "console";
import { readFileSync, existsSync } from "fs";
import dotenv from 'dotenv';
dotenv.config();



/**
 * Autoriza una org de integración en SFDX en base a la rama de destino de la PR en Bitbucket.
 * La configuración se almacena en el fichero de configuración bitbucket-pipelines.json
 *
 * @param {String} targetBranch Rama destino de la PR, pasada como parámetro del CLI
 * @author javiermartinezdepisson@seidor.es
 * @date 07/11/2022
 */
function main() {
  let externalCiConfig = {
    deployments: {
      dev: {
        authUrlVariable: "AUTH_URL"
      },
      develop: {
        authUrlVariable: "AUTH_URL"
      },
      release: {
        authUrlVariable: "AUTH_URL"
      },
      master: {
        authUrlVariable: "AUTH_URL"
      }
    }
  };

  let authorizationVariableByBranchName = {};

  try {
    externalCiConfig = JSON.parse(
      readFileSync("config/ci-pipelines.json", {
        encoding: "UTF-8"
      })
    );
  } catch (error) {
    console.log(
      "No existe o no se ha podido recuperar configuración externa de pipelines de config/ci-pipelines.json. Se usarán los valores por defecto"
    );
  } finally {
    authorizationVariableByBranchName = Object.assign(
      authorizationVariableByBranchName,
      externalCiConfig.deployments
    );
  }

  let targetBranch = process.argv[2] || "dev";
  let targetOrg =
    authorizationVariableByBranchName[targetBranch]?.authUrlVariable ||
    "SFDX_INTEGRATION_URL";

  if (
    targetBranch.includes("/") &&
    !authorizationVariableByBranchName[targetBranch]
  ) {
    let targetGroupBranch = targetBranch.substring(
      0,
      targetBranch.indexOf("/")
    );

    targetOrg =
      authorizationVariableByBranchName[targetGroupBranch]?.authUrlVariable ||
      "SFDX_INTEGRATION_URL";
  }

  console.log("secreto SFDX_INTEGRATION_URL");
  console.log(targetOrg);
  console.log(
    `Configurando la rama ${targetBranch} para atacar a ${targetOrg}`
  );
  const authUrl = process.env.AUTH_URL;
  console.log("AUTH URL:::", process.env.AUTH_URL);
  if (!authUrl) {
    console.error("AUTH_URL environment variable is not set.");
    return;
  }


  // execSync(`echo $${targetOrg} > authFile`, {
  //   stdio: "inherit"
  // });

  // execSync(`echo ${process.env[targetOrg]} > authFile`, {
  //   stdio: "inherit"
  // });
  execSync(`echo ${authUrl} > authFile`, {
    stdio: "inherit"
  });
  
  const deleteCommand = process.platform === "win32" ? "del" : "rm";
 
  function fileDeletion() {
    try {
      execSync(
        `sfdx auth:sfdxurl:store --alias target_org --sfdx-url-file authFile --set-default && ${deleteCommand} authFile`,
        {
          stdio: "inherit"
        }
      );
  
      const fileDeleted = !existsSync("authFile");
      if (fileDeleted) {
        console.log("El archivo 'authFile' se ha eliminado correctamente.");
      } else {
        console.log("Error: No se pudo eliminar el archivo 'authFile'.");
      }
    } catch (error) {
      console.error("Error al eliminar el archivo 'authFile':", error);
    }
  }
  fileDeletion();

}
 

main();
