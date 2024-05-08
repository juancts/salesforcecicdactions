import { execSync } from "child_process";
import { Console, profile } from "console";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  appendFileSync,
  writeFileSync
} from "fs";
import { check } from "prettier";
import { start } from "repl";
import { parseString } from "xml2js";

function ignoreProfiles(ignoreProfilesLine) {
  console.log("Ignorando perfiles en el deploy inicial");
  appendFileSync(".forceignore", ignoreProfilesLine);
}

function reEnableProfiles(realForceIgnore) {
  console.log("Rehabilitando Profiles");
  writeFileSync(".forceignore", realForceIgnore);
}

function readPipelinesConfig() {
  let externalCiConfig = JSON.parse(
    readFileSync("config/ci-pipelines.json", {
      encoding: "UTF-8"
    })
  );

  if (!externalCiConfig.deployments) {
    throw "El fichero config/ci-pipelines.json no tiene el formato esperado";
  }

  return externalCiConfig;
}

function findConfigForReference(deployConfig, externalCiConfig) {
  let targetBranch = deployConfig.targetBranch.replace("origin/", "");
  let deploymentConfig =
    externalCiConfig.deployments[targetBranch] || undefined;

  if (!deploymentConfig && targetBranch.includes("/")) {
    let targetGroupBranch = targetBranch.substring(
      0,
      targetBranch.indexOf("/")
    );

    deploymentConfig = externalCiConfig.deployments[targetGroupBranch];
  }

  if (!deploymentConfig) {
    throw `No se ha encontrado configuración para la rama de referencia ${targetBranch}`;
  }
}

function changeOverrideConfig(deployConfig, deploymentConfig) {
  let overrideConfig = {};

  if (deployConfig.validate) {
    overrideConfig = deploymentConfig.onValidate;
  } else {
    overrideConfig = deploymentConfig.onDeploy;
  }

  if (overrideConfig.mode) {
    deployConfig.mode = overrideConfig.mode;
  }

  if (overrideConfig.testLevel) {
    deployConfig.testLevel = overrideConfig.testLevel;
  }

  if (overrideConfig.runApexTests && overrideConfig.runApexTests.length) {
    deployConfig.testsToRun = overrideConfig.runApexTests.join(",");
  }

  return overrideConfig;
}

function generateDeltaPackages(deployConfig) {
  console.log(
    `Generando package.xml con Delta de cambios diferencial/destructivo desde ${deployConfig.targetBranch}`
  );
  execSync(
    `sfdx sgd:source:delta --from ${deployConfig.targetBranch} --ignore .forceignore --ignore-whitespace -o deploy-manifest`,
    {
      stdio: "inherit"
    }
  );
  console.log("**** Package DELTA generado ****");
  console.log("********************************");
  console.log(
    readFileSync("deploy-manifest/package/package.xml", {
      encoding: "utf-8"
    })
  );
}

function generateFullPackages() {
  console.log(`Generando package.xml del proyecto completo`);
  execSync(
    "sfdx project generate manifest --source-dir force-app --name deploy-manifest/package/fullPackage.xml",
    {
      stdio: "inherit"
    }
  );
}

function deltaDeployInit() {
  console.log("**** Resumen de despliegue/validación ****");
  console.log("package.xml");
  console.log(
    readFileSync("deploy-manifest/package/package.xml", {
      encoding: "utf-8"
    })
  );
  console.log("destructiveChanges.xml");
  console.log(
    readFileSync("deploy-manifest/destructiveChanges/destructiveChanges.xml", {
      encoding: "utf-8"
    })
  );
}

function checkIsDestructiveByXML(jsonDescFromPackage) {
  let expectedReturn = false;
  let types = jsonDescFromPackage.Package.types;

  if (
    jsonDescFromPackage.Package.types !== undefined &&
    jsonDescFromPackage.Package.types !== null &&
    jsonDescFromPackage.Package.types.length > 0
  ) {
    expectedReturn = true;
  }

  return expectedReturn;
}

function apexTestConfig(jsonFromXMLPackage, deltaDeployObject) {
  let types = jsonFromXMLPackage.Package.types;

  console.log(
    "Intentando recuperar las relaciones entre las clases y sus test:"
  );

  types.forEach((type) => {
    if (type.name[0] == "ApexClass") {
      deltaDeployObject.flagXmlContainsApex = true;

      if (
        type.members !== undefined &&
        type.members !== null &&
        type.members.length > 0
      ) {
        type.members.forEach((member) => {
          let Lowmember = member.toLowerCase();

          if (!Lowmember.includes("test")) {
            if (!deltaDeployObject.classesInXML.includes(member)) {
              deltaDeployObject.classesInXML.push(member);
            }
          } else {
            if (!deltaDeployObject.testsToExecute.includes(member)) {
              deltaDeployObject.testsToExecute.push(member);
            }
          }
        });
      }
    }

    if (
      type.name[0] == "ValidationRule" ||
      type.name[0] == "RecordType" ||
      type.name[0] == "DuplicateRule"
    ) {
      deltaDeployObject.flagXmlContainsApex = true;

      if (
        type.members !== undefined &&
        type.members !== null &&
        type.members.length > 0
      ) {
        type.members.forEach((member) => {
          if (member.includes(".")) {
            let endClass = "Util";
            let dotPoint = member.indexOf(".");
            let startClass = member.substring(0, dotPoint);
            let classToFind = startClass + endClass;

            if (!deltaDeployObject.classesInXML.includes(classToFind)) {
              deltaDeployObject.classesInXML.push(classToFind);
            }
          }
        });
      }
    }

    if (type.name[0] == "CustomField") {
      deltaDeployObject.flagXmlContainsApex = true;

      if (
        type.members !== undefined &&
        type.members !== null &&
        type.members.length > 0
      ) {
        type.members.forEach((member) => {
          if (member.includes(".")) {
            let endClass = "Util";
            let dotPoint = member.indexOf(".");
            let startClass = member.substring(0, dotPoint);
            let classToFind = "";
            //CUSTOMFIELD FROM CUSTOMOBJECT
            if (startClass.indexOf("__c") != -1) {
              let customClassPoint = startClass.indexOf("__c");
              let customClassName = startClass.substring(0, customClassPoint);
              classToFind = customClassName + endClass;
            } else {
              classToFind = startClass + endClass;
            }

            if (!deltaDeployObject.classesInXML.includes(classToFind)) {
              deltaDeployObject.classesInXML.push(classToFind);
            }
          }
        });
      }
    }

    if (type.name[0] == "CustomObject") {
      deltaDeployObject.flagXmlContainsCustomObject = true;

      if (
        type.members !== undefined &&
        type.members !== null &&
        type.members.length > 0
      ) {
        type.members.forEach((member) => {
          let customObjectToRelateAPI = "";
          //CUSTOMFIELD FROM CUSTOMOBJECT HAY QUE LIMPIARLO PARA QUE COINCIDA CON LA RESPONSE DE LA API
          if (member.indexOf("__c") != -1) {
            let customClassPoint = member.indexOf("__c");
            customObjectToRelateAPI = member.substring(0, customClassPoint);
          } else {
            customObjectToRelateAPI = member;
          }

          if (
            !deltaDeployObject.customObjectsInXML.includes(
              customObjectToRelateAPI
            )
          ) {
            deltaDeployObject.customObjectsInXML.push(customObjectToRelateAPI);
          }
        });
      }
    }
    //SI HAY ITEMS SUSCEPTIBLES DE ROMPER TEST QUE NO SE PUEDEN RELACIONAR, LANZO LA COLECCION DE PIPELINES.JSON
    /*if (itemsForTestCollectionTestIfContains.includes(type.name[0])) {
      console.log('Presencia de Items en el XML Susceptibles de romper tests irrelacionables, se lanzarán una colección básica de tests.');
      flagXmlContainsItemsToTestCollection = true;
    }*/
  });

  return deltaDeployObject;
}

function getObjectMetadataRelationship() {
  console.log(
    "Presencia de CustomObject confirmada, solicitando acceso a ORG:"
  );
  let customObjectsResponse = execSync(
    `sfdx force:data:query -q "SELECT MetadataComponentId,MetadataComponentName,MetadataComponentNamespace,MetadataComponentType,RefMetadataComponentId,RefMetadataComponentName FROM MetadataComponentDependency WHERE RefMetadataComponentType='CustomObject' AND MetadataComponentType = 'ApexClass'" -t --json`,
    {
      encoding: "utf-8"
    }
  );

  var objectsData = JSON.parse(customObjectsResponse);

  return objectsData;
}

function addTestFromClassesToList(deltaDeployObject, blackList) {
  console.log("Presencia de Apex confirmada, solicitando acceso a ORG:");

  let classesResponse = execSync(
    `sfdx force:data:query -q "SELECT MetadataComponentId,MetadataComponentName,MetadataComponentNamespace,MetadataComponentType,RefMetadataComponentId,RefMetadataComponentName FROM MetadataComponentDependency WHERE RefMetadataComponentType='ApexClass'" -t --json`,
    {
      encoding: "utf-8"
    }
  );

  var classesData = JSON.parse(classesResponse);
  classesData = classesData.result;

  if (
    classesData !== undefined &&
    classesData.records !== undefined &&
    classesData.records.length > 0 &&
    deltaDeployObject.classesInXML.length > 0
  ) {
    classesData.records.forEach((record) => {
      if (
        deltaDeployObject.classesInXML.includes(
          record.RefMetadataComponentName
        ) &&
        !blackList.includes(record.MetadataComponentName)
      ) {
        let lowRecord = record.MetadataComponentName.toLowerCase();

        if (
          lowRecord.includes("test") &&
          !deltaDeployObject.testsToExecute.includes(
            record.MetadataComponentName
          )
        ) {
          deltaDeployObject.testsToExecute.push(record.MetadataComponentName);
        }
      }
    });
  }

  return deltaDeployObject;
}

function addCustomObjectsTestToList(objectsData, deltaDeployObject, blackList) {
  objectsData.records.forEach((record) => {
    if (
      deltaDeployObject.customObjectsInXML.includes(
        record.RefMetadataComponentName
      ) &&
      !blackList.includes(record.MetadataComponentName)
    ) {
      if (
        !deltaDeployObject.classesInXML.includes(record.MetadataComponentName)
      ) {
        deltaDeployObject.classesInXML.push(record.MetadataComponentName);
      }
    }
  });

  return deltaDeployObject;
}

function profileDeployments(deployConfig) {
  let profileNames = [];
  let targetBranch = deployConfig.targetBranch;
  let currentBranch = deployConfig.currentBranch;

  var allBranches = execSync("git branch --format='%(refname:short)'")
    .toString()
    .trim()
    .split("\n");
  try {
    console.log("git diff " + targetBranch + " --name-only --diff-filter=ACM");

    if (targetBranch) {
      profileNames = execSync(
        `git diff ${targetBranch} --name-only --diff-filter=ACM`,
        {
          encoding: "utf-8"
        }
      )
        .split("\n")
        .filter((path) => path.includes(".profile-meta.xml"))
        .map((path) =>
          path.substring(
            path.lastIndexOf("/") + 1,
            path.lastIndexOf(".profile-meta.xml")
          )
        );
      console.log("PROFILE NAMES::::::", profileNames);
    } else {
      console.error("deployConfig.targetBranch no tiene un valor válido.");
    }
  } catch (error) {
    console.error("Error al ejecutar git diff:", error);
    return; // Detener la ejecución de la función si se produce un error
  }

  if (profileNames.length) {
    let profileDeployArgs = [
      "sfdx force:source:deploy",
      `--targetusername ${deployConfig.targetusername}`,
      "-x deploy-manifest/package/packageProfiles.xml",
      "--wait 200",
      "--ignorewarnings",
      "--verbose",
      "-l NoTestRun"
    ];

    let sourceDir = profileNames.join(" force-app/main/default/profiles/");

    console.log(`Generando package.xml de los perfiles`);
    execSync(
      "sfdx project generate manifest --source-dir force-app/main/default/profiles/ --name deploy-manifest/package/packageProfiles.xml",
      {
        stdio: "inherit"
      }
    );
    // Verificar si sfpowerkit está instalado
    function isSfpowerkitInstalled() {
      try {
        // Intenta ejecutar un comando sfpowerkit y verifica si hay errores
        execSync("sfdx sfpowerkit:version", { stdio: "ignore" });
        return true; // Devuelve true si no hay errores
      } catch (error) {
        return false; // Devuelve false si hay errores
      }
    }
    if (isSfpowerkitInstalled()) {
      try {
        console.log(`Reconciliando perfiles ${profileNames.join(",")}`);
        execSync(
          `sfdx sfpowerkit:source:profile:reconcile --profilelist "${profileNames.join(",")}" -u ${deployConfig.targetusername}`,
          {
            stdio: "inherit"
          }
        );
      } catch (error) {
        console.log(error);
      }
    }

    console.log("Desplegando perfiles");
    console.log(`Ejecutando ${profileDeployArgs.join(" ")}`);
    execSync(profileDeployArgs.join(" "), {
      stdio: "inherit"
    });
  }
}

/**
 * Script que lanza un despliegue gestionando validación y lanzamiento de tests core u específicos. Script alias a sfdx force:source:deploy
 *
 * @author mgarciafernandez
 * @date 11/07/2023
 * @param targetusername Usuario de entorno. Pasado como primer parámetro del script
 * @param targetBranch Referencia destino de Git para las comparaciones.  Pasado como segundo parámetro del script
 * @param mode Modo de despliegue: FULL, FULL_DESTRUCTIVE o DELTA. Pasado como tercer parámetro del script
 * @param validate Valida el despliegue en vez de ejecutarlo. Pasado como cuarto parámetro del script
 * @param testLevel Nivel de ejecución de tests. Pasado como quinto parámetro del script
 * @param testsToRun Lanza test específicos. Pasado como sexto parámetro del script
 */
function main() {
  const deployConfig = {
    argumentocero: process.argv[0],
    argumento1: process.argv[1],
    targetusername: process.argv[2],
    targetBranch: process.argv[3],
    mode: process.argv[4],
    validate: process.argv[5] === "true",
    testLevel: process.argv[6] || "NoTestRun",
    testsToRun: process.argv[7],
    currentBranch: process.argv[8]
  };

  const realForceIgnore = readFileSync(".forceignore", { encoding: "utf-8" });
  const ignoreProfilesLine = "\n#profiles \n/force-app/main/default/profiles/";

  try {
    console.log("Leyendo configuración de despliegue");

    let externalCiConfig = readPipelinesConfig();
    console.log(
      `Buscando configuración para referencia ${deployConfig.targetBranch}`
    );

    let deploymentConfig = findConfigForReference(
      deployConfig,
      externalCiConfig
    );

    // Se sobreescribe la configuración por defecto con los valores de los ficheros de configuración o con las variables de entorno, siempre dando preferencia a la variable de entorno.
    let overrideConfig = changeOverrideConfig(deployConfig, deploymentConfig);
  } catch (error) {
    console.log(
      "No existe o no se ha podido recuperar configuración externa de pipelines de config/ci-pipelines.json. Se usarán los valores por defecto aplicados por las variables de entorno del pipeline"
    );
    console.error("Detailed error: " + error);
    if (process.env["DEPLOY_MODE"]) {
      deployConfig.mode = process.env["DEPLOY_MODE"];
    }

    if (process.env["APEX_TEST_LEVEL"]) {
      deployConfig.testLevel = process.env["APEX_TEST_LEVEL"];
    }

    if (process.env["APEX_SPECIFIED_TESTS"]) {
      deployConfig.testsToRun = process.env["APEX_SPECIFIED_TESTS"];
    }
  } finally {
    /*Se mantienen las variables del fichero ci-pipelines.json a no ser que ocurra una excepción. En ese caso se obtienen las variables de entorno*/
  }

  let commandArguments = [
    "sfdx force:source:deploy",
    `--targetusername ${deployConfig.targetusername}`,
    "-x deploy-manifest/package/package.xml",
    "--wait 200",
    "--ignorewarnings",
    "--verbose"
  ];

  console.log(
    `Lanzado despliegue a entorno ${deployConfig.targetusername} bajo modo ${deployConfig.mode}`
  );
  if (!existsSync("deploy-manifest")) {
    mkdirSync("deploy-manifest");
  }

  if (!existsSync("deploy-manifest/package")) {
    mkdirSync("deploy-manifest/package");
  }

  if (!existsSync("test-reports")) {
    mkdirSync("test-reports");
  }

  //Confguracion para validaciones
  if (deployConfig.validate) {
    console.log("Despliegue configurado como validación");
    commandArguments.push("-c");

    //VALIDACION DELTA PARA DEV
    if (deployConfig.mode === "DELTA") {
      try {
        ignoreProfiles(ignoreProfilesLine);
        generateDeltaPackages(deployConfig);
        commandArguments.push(
          "--postdestructivechanges deploy-manifest/destructiveChanges/destructiveChanges.xml"
        );
        deployConfig.testLevel = "RunSpecifiedTests";

        if (deployConfig.testLevel === "RunSpecifiedTests") {
          deltaDeployInit();
          var blackList = readFileSync("config/test-black-list.txt", {
            encoding: "utf-8"
          });
          var xmlDoc = readFileSync("deploy-manifest/package/package.xml", {
            encoding: "utf-8"
          });
          var flagXmlContainsApex = false;
          var flagXmlContainsCustomObject = false;
          var flagXmlContainsItemsToTestCollection = false;
          var executeAllTestOnFail = false;
          //var itemsForTestCollectionTestIfContains = new Array('CustomPermission', 'StandardValueSet');
          var testsToExecute = Array();
          var classesInXML = Array();
          var customObjectsInXML = Array();

          var deltaDeployObject = {
            testsToExecute: testsToExecute,
            classesInXML: classesInXML,
            customObjectsInXML: customObjectsInXML,
            executeAllTestOnFail: false,
            flagXmlContainsApex: false,
            flagXmlContainsCustomObject: false,
            flagXmlContainsItemsToTestCollection: false
          };

          var metadataQueryApex =
            "SELECT MetadataComponentId,MetadataComponentName,MetadataComponentNamespace,MetadataComponentType,RefMetadataComponentId,RefMetadataComponentName FROM MetadataComponentDependency WHERE RefMetadataComponentType='ApexClass'";
          var metadataQueryObjectsToApex =
            "SELECT MetadataComponentId,MetadataComponentName,MetadataComponentNamespace,MetadataComponentType,RefMetadataComponentId,RefMetadataComponentName FROM MetadataComponentDependency WHERE RefMetadataComponentType='CustomObject' AND MetadataComponentType = 'ApexClass'";

          console.log("Escaneando Package.xml en busca de metadatos:");

          var jsonFromPackage = "";
          parseString(xmlDoc, (err, result) => {
            if (err) {
              throw err;
            }
            // `result` is a JavaScript object
            // convert it to a JSON string
            jsonFromPackage = JSON.stringify(result, null, 4);
          });

          var jsonFromXMLPackage = JSON.parse(jsonFromPackage);

          if (
            jsonFromXMLPackage.Package.types !== undefined &&
            jsonFromXMLPackage.Package.types !== null &&
            jsonFromXMLPackage.Package.types.length > 0
          ) {
            deltaDeployObject = apexTestConfig(
              jsonFromXMLPackage,
              deltaDeployObject
            );

            //LA BUSQUEDA DE CUSTOM OBJECTS CON APEXCLASS VA POR OTRA CONSULTA
            if (deltaDeployObject.flagXmlContainsCustomObject == true) {
              var objectsData = getObjectMetadataRelationship();
              objectsData = objectsData.result;

              //METEMOS LAS CLASESAPEX RELACIONADAS CON OBJECTS EN EL ARRAY PARA QUE SE BUSQUEN JUSTO DESPUES SUS TESTS
              if (
                objectsData !== undefined &&
                objectsData.records !== undefined &&
                objectsData.records.length > 0 &&
                deltaDeployObject.customObjectsInXML.length > 0
              ) {
                deltaDeployObject = addCustomObjectsTestToList(
                  objectsData,
                  deltaDeployObject,
                  blackList
                );

                if (deltaDeployObject.classesInXML.length > 0) {
                  deltaDeployObject.flagXmlContainsApex = true;
                }
              }
            }

            //SI NO CONTIENE APEX, NO TIENE SENTIDO RELACIONAR NADA
            if (deltaDeployObject.flagXmlContainsApex == true) {
              deltaDeployObject = addTestFromClassesToList(
                deltaDeployObject,
                blackList
              );
            } else {
              console.log("Clases del XML");
              console.log(deltaDeployObject.classesInXML);
              console.log("Clases de la API");
              console.log(deltaDeployObject.classesData);
              console.log(
                "Imposible recuperar las clases de la API para comparar, Se ejecutarán todos los tests por defecto."
              );
              deltaDeployObject.executeAllTestOnFail = true;
            }
          } else {
            console.log("Clases del XML");
            console.log(deltaDeployObject.classesInXML);
            console.log(
              "Imposible recuperar las clases del XML para comparar, Se ejecutarán todos los tests por defecto."
            );
            deltaDeployObject.executeAllTestOnFail = true;
          }

          //CONFIG FINAL PARA RUNSPECIFIEDTESTS ON DELTA
          if (
            deployConfig.testLevel === "RunSpecifiedTests" &&
            deployConfig.testsToRun &&
            deltaDeployObject.executeAllTestOnFail == false
          ) {
            console.log("Se ejecutarán los siguientes tests:");

            //SI HAY ELEMENTOS EN EL PACKAGE SUSCEPTIBLES DE HACER SALTAR ALGUN TEST, LANZAMOS LA COLECCION BASICA DE PIPELINES.JSON ON VALIDATE JUNTO A LOS RELACIONADOS (SI HUBIESE)
            if (
              deltaDeployObject.flagXmlContainsItemsToTestCollection == true
            ) {
              deployConfig.testsToRun.split(",").forEach((testItem) => {
                if (!deltaDeployObject.testsToExecute.includes(testItem)) {
                  deltaDeployObject.testsToExecute.push(testItem);
                }
              });
            }

            if (deltaDeployObject.testsToExecute.length > 0) {
              deployConfig.testsToRun =
                deltaDeployObject.testsToExecute.toString();
              deployConfig.testsToRun.split(",").forEach((test) => {});

              console.log(`Teses a ejecutar: ${deployConfig.testsToRun}`);
            }
            commandArguments.push(
              `-l ${deployConfig.testLevel} --resultsdir test-reports --junit --coverageformatters cobertura`
            );
            commandArguments.push(`-r ${deployConfig.testsToRun}`);
          } else {
            deployConfig.testLevel = "RunLocalTests";
            commandArguments.push(
              `-l ${deployConfig.testLevel} --resultsdir test-reports --junit --coverageformatters cobertura`
            );
          }

          //DEJAMOS EL FORCEIGNORE COMO ESTABA
          reEnableProfiles(realForceIgnore);
        }
      } catch (error) {
        console.error(error.message);
        process.exit(1);
      }
    }

    if (deployConfig.mode !== "DELTA") {
      ignoreProfiles(ignoreProfilesLine);
      generateFullPackages();

      commandArguments = [
        "sfdx force:source:deploy",
        `--targetusername ${deployConfig.targetusername}`,
        "-x deploy-manifest/package/fullPackage.xml",
        "--wait 200",
        "--ignorewarnings",
        "--verbose"
      ];

      commandArguments.push("-c");

      if (deployConfig.testLevel) {
        console.log(`Configurando tests para branch ${deployConfig.targetBranch}`);
        console.log(`Configurando tests para ${deployConfig.targetusername}`);
        console.log(`Configurando testlevel como ${deployConfig.testLevel}`);

        commandArguments.push(
          `-l ${deployConfig.testLevel} --resultsdir test-reports --junit --coverageformatters cobertura`
        );
      }

      //DEJAMOS EL FORCEIGNORE COMO ESTABA
      reEnableProfiles(realForceIgnore);
    }
  } else {
    /*generateDeltaPackages(deployConfig);
    console.log('Escaneando destructiveChanges.xml en busca de metadatos:');
    console.log(readFileSync('deploy-manifest/destructiveChanges/destructiveChanges.xml', {
      encoding: 'utf-8'
    }));
    var descXmlDoc = readFileSync('deploy-manifest/destructiveChanges/destructiveChanges.xml', {
      encoding: 'utf-8'
    });
    var jsonDescFromPackage = '';

    parseString(descXmlDoc, (err, result) => {
      if (err) {
        throw err
      }
      // `result` is a JavaScript object
      // convert it to a JSON string
      jsonDescFromPackage = JSON.stringify(result, null, 4);
    });

    var jsonDescFromXMLPackage = JSON.parse(jsonDescFromPackage);

    if(checkIsDestructiveByXML(jsonDescFromXMLPackage))
    {
      if (deployConfig.testLevel) 
      {
        commandArguments = [
          'sfdx force:source:deploy',
          `--targetusername ${deployConfig.targetusername}`,
          '--postdestructivechanges destructiveChanges/destructiveChanges.xml',
          '--wait 200',
          '--ignorewarnings',
          '--verbose'
        ];
      
        console.log(`Configurando tests para ${deployConfig.targetusername}`);
        console.log(`Configurando testlevel como ${deployConfig.testLevel}`);
    
        commandArguments.push(`-l ${deployConfig.testLevel} --resultsdir test-reports --junit --coverageformatters cobertura`);
      }
    }
    else
    {*/
    //DEPLOYMENTS EN FULL SIEMPRE O FULL DESTRUCTIVE
    ignoreProfiles(ignoreProfilesLine);
    generateFullPackages();

    commandArguments = [
      "sfdx force:source:deploy",
      `--targetusername ${deployConfig.targetusername}`,
      "-x deploy-manifest/package/fullPackage.xml",
      "--wait 200",
      "--ignorewarnings",
      "--verbose"
    ];

    if (deployConfig.testLevel) {
      console.log(`Configurando tests para branch ${deployConfig.targetBranch}`);
      console.log(`Configurando tests para ${deployConfig.targetusername}`);
      console.log(`Configurando testlevel como ${deployConfig.testLevel}`);

      commandArguments.push(
        `-l ${deployConfig.testLevel} --resultsdir test-reports --junit --coverageformatters cobertura`
      );
    }

    reEnableProfiles(realForceIgnore);
    //}
  }

  try {
    console.log(`Ejecutando ${commandArguments.join(" ")}`);
    execSync(commandArguments.join(" "), {
      stdio: "inherit"
    });

    if (!deployConfig.validate) {
      profileDeployments(deployConfig);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

main();
