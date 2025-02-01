import "dotenv/config";
import fs from "node:fs";

const NB_IGNORE_FIRST_LINES = 6;

/** Symbole de début d'une transaction */
const START_TRANS = "^";

let newTrans = {};
let listTrans = [];

function lineParse(line, idx) {
    try {
        //TODEL console.log(`${idx} : `, line);

        const key = line[0];
        let value = line.substring(1);
        console.log(`${idx} - key= ${key} - value= ${value}`);

        switch (key) {
            case "^":
                if (Object.keys(newTrans).length) {
                    listTrans.push(newTrans);
                } else {
                }
                newTrans = {};
                break;

            case "C":
                //TODO A voir ce qu'on fait avec le C? Numéro de chèque ?
                if (value !== "X") {
                    console.log(`⛔ key= ${key} - Ignored line : ${line}`);
                }
                break;

            case "D": //DATE
                newTrans.date = value;
                break;

            case "T": //AMOUNT
                //On enlève l'éventuelle virgule séparateur de millier
                newTrans.amount = Number(value.replaceAll(",", ""));
                break;

            case "M": //NOTE
                newTrans.note = value;
                break;

            case "L": //CATEGORY:SUBCATEGORY
                if (value.indexOf(":") !== -1) {
                    const splitValue = value.split(":");
                    newTrans.category = splitValue[0];
                    newTrans.subcategory = splitValue[1];
                } else {
                    if (value[0] === "[") {
                        value = value.substring(1, value.length - 1);
                        newTrans.tags = "TRANSFER";
                    }
                    newTrans.category = value;
                }
                break;

            case "P": //DESCRIPTION
                newTrans.description = value;
                break;

            //TODO Split Transaction
            case "S": //SPLIT-CATEGORY
            case "E": //SPLIT-DESCRIPTION
            case "$": //SPLIT-AMOUNT
                console.log(`⭕ key= ${key} - Split Transaction : ${line}`);
                break;

            default:
                console.log(`⚠️ key= ${key} - Unknown line : ${line}`);
        }
    } catch (error) {
        throw new Error("lineParse");
    }
}

try {
    console.log(`🟢🟢 DEBUT DU PROGRAMME ${process.env.npm_package_name} - v.${process.env.npm_package_version}`);

    //LECTURE QIF
    const data = fs.readFileSync(process.env.FILE_IN, "utf8");
    const dataLines = data.split(/\r?\n/);
    console.log(`File read : ${dataLines.length} lines`);

    const startParse = dataLines.indexOf(START_TRANS);

    if (startParse === -1) {
        throw new Error("Aucune transaction trouvée dans le fichier");
    }

    //    dataLines.forEach((elt, idx) => {
    for (let i = startParse; i < dataLines.length; i++) {
        lineParse(dataLines[i], i, newTrans);
    }

    //ECRITURE CSV
    let listTransCSV = [];
    const SEP = "|";
    listTrans.forEach((elt) => {
        const transCSV =
            elt.date +
            SEP +
            elt.amount +
            SEP +
            elt.description +
            SEP +
            (elt.category || "") +
            SEP +
            (elt.subcategory || "") +
            SEP +
            (elt.note || "") +
            SEP +
            (elt.tags || ""); //TODO Ajouter le tag INIT
        listTransCSV.push(transCSV);
    });

    fs.writeFileSync(process.env.FILE_OUT, listTransCSV.join("\n"));

    console.log(`🏁🏁 Fin du programme avec succès - ${listTrans.length} transactions traitées`);
} catch (error) {
    console.log(`💥 CATCH 💥`);
    console.error(error);
}
