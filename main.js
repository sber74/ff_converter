import "dotenv/config";
import fs from "node:fs";

const FIRST_TRAN = 6; //ligne 7
/** Symbole de début d'une transaction */
const START_TRANS = "^";
const CSV_SEP = ";";

let account = { nbSplitted: 0, nbSplitTrans: 0, nbTransfer: 0 };
let newTrans = {};
let listTrans = [];
let mode = "ACC"; //ou TRAN

//#region LINEPARSE
function lineParse(line, idx) {
    try {
        //TODEL console.log(`${idx} : `, line);

        const key = line[0];
        let value = line.substring(1).replaceAll(CSV_SEP, "¤");
        //        console.log(`${idx} - key= ${key} - value= ${value}`);

        if (key !== START_TRANS && mode === "ACC") {
            switch (key) {
                case "D": //DATE
                    account.opening_date = value;
                    break;

                case "T": //SOLDE INITIAL
                    //On enlève l'éventuelle virgule séparateur de millier
                    account.initialBalance = Number(value.replaceAll(",", ""));
                    break;

                case "P": //DESCRIPTION
                    account.description = value;
                    break;

                case "L": //ACCOUNT NAME
                    if (value[0] === "[") {
                        value = value.substring(1, value.length - 1);
                        account.name = value;
                    } else {
                        console.log(`${idx} - key= ${key} - value= ${value}`);
                        throw new Error("Impossible de déterminer le nom du compte");
                    }
                    break;

                default:
                    //NOTHING TO DO
                    break;
            }
            return;
        }

        //TRANSACTION MODE
        switch (key) {
            case START_TRANS:
                mode = "TRAN";
                if (Object.keys(newTrans).length) {
                    listTrans.push(newTrans);
                } else {
                }
                newTrans = {};
                break;

            case "C":
                //TODO A voir ce qu'on fait avec le C? Numéro de chèque ?
                if (value !== "X") {
                    console.log(`⛔ ${idx} -key= ${key} - Ignored line : ${value}`);
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
                        if (!newTrans?.tags) {
                            newTrans.tags = [];
                        }
                        newTrans.tags.push("TRANSFER");
                        account.nbTransfer++;
                        if (value.substring(0, 2) !== account.name.substring(0, 2)) {
                            newTrans.tags.push("INTERNATIONAL");
                        }
                    }
                    newTrans.category = value;
                }
                break;

            case "P": //DESCRIPTION
                newTrans.description = value;
                break;

            case "N": //NUMERO
                newTrans.number = Number(value);
                break;

            //TODO Split Transaction
            case "S": //SPLIT-CATEGORY
                account.nbSplitted++;
            case "E": //SPLIT-DESCRIPTION
            case "$": //SPLIT-AMOUNT
                if (newTrans?.tags) {
                    if (newTrans.tags.indexOf("SPLIT") === -1) {
                        newTrans.tags.push("SPLIT");
                        account.nbSplitTrans++;
                    }
                } else {
                    newTrans.tags = ["SPLIT"];
                    account.nbSplitTrans++;
                }

                console.log(`⭕ ${idx} - key= ${key} - Split Transaction : ${value}`);
                break;

            default:
                console.log(`⚠️ ${idx} - key= ${key} - Unknown line : ${value}`);
        }
    } catch (error) {
        throw new Error(error);
    }
}

//#region TRANSFORM
function transformTrans(trans) {
    try {
        let transCSV = { tags: [] };

        transCSV.date = trans.date;
        transCSV.amount = trans.amount;
        transCSV.number = trans.number || "";
        transCSV.note = trans.note || "";
        transCSV.categoryFF = trans.subcategory || ""; //TODO ajouter un tage pour appliquer une catégorie FF
        transCSV.from = account.name;

        if (trans?.description) {
            transCSV.description = trans.description;
        } else {
            if (trans?.tags && trans.tags.indexOf("TRANSFER") !== -1) {
                transCSV.description = "Virement";
            } else {
                throw new Error("Description absente");
            }
        }
        //⚠️ A garder impérativement après la mise à jour de transCSV.description
        if (trans?.category) {
            if (trans?.tags && trans.tags.indexOf("INTERNATIONAL") !== -1) {
                transCSV.to = "Virement international";
                transCSV.note2 = "[VIR. INTER. TO: " + trans.category + "]";
                transCSV.description = "✈️" + transCSV.description;
            } else {
                transCSV.to = trans.category;
                transCSV.note2 = "";
            }
        } else {
            throw new Error("Catégorie inconnue");
        }

        //⚠️ A garder impérativement après la mise à jour de transCSV.description
        if (trans?.tags && trans.tags.indexOf("SPLIT") !== -1) {
            transCSV.description = "🔃" + transCSV.description;
        }

        if (trans?.tags) {
            trans.tags.push("INIT");
        } else {
            trans.tags = ["INIT"];
        }
        transCSV.tags = trans.tags.join(" ");

        /////////////////////

        const lineTransCSV =
            transCSV.from +
            CSV_SEP +
            transCSV.date +
            CSV_SEP +
            transCSV.amount +
            CSV_SEP +
            transCSV.to +
            CSV_SEP +
            transCSV.categoryFF +
            CSV_SEP +
            transCSV.description +
            CSV_SEP +
            transCSV.note +
            CSV_SEP +
            transCSV.tags +
            CSV_SEP +
            transCSV.number +
            CSV_SEP +
            transCSV.note2;

        return lineTransCSV;
    } catch (error) {
        throw new Error(error);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//#region MAIN
try {
    console.log(`🟢🟢 DEBUT DU PROGRAMME ${process.env.npm_package_name} - v.${process.env.npm_package_version}`);

    //LECTURE QIF
    const fileNameIn = process.env.DIR_IN + process.env.FILE_NAME + process.env.EXT_IN;
    console.log(`Lecture du fichier ${fileNameIn}`);
    const data = fs.readFileSync(fileNameIn, "utf8");
    const dataLines = data.split(/\r?\n/);
    console.log(`File read : ${dataLines.length} lines`);

    const startParse = dataLines.indexOf(START_TRANS);
    //TODO à améliorer
    /*switch (startParse) {
        case -1:
            throw new Error("Aucune transaction trouvée dans le fichier");
            break;
        case FIRST_TRAN:
            //OK
            break;
        default:
            throw new Error("Priopriétés du compte incomplète");
    }*/

    dataLines.forEach((elt, idx) => {
        //        for (let i = startParse; i < dataLines.length; i++) {
        //for (let i = 0; i < dataLines.length; i++) {
        //lineParse(dataLines[i], i, newTrans);
        if (elt.trim() !== "") {
            lineParse(elt, idx, newTrans);
        }
    });

    //ECRITURE CSV
    let listTransCSV = [];
    listTrans.forEach((elt) => {
        listTransCSV.push(transformTrans(elt));
    });

    const fileNameOut = process.env.DIR_OUT + process.env.FILE_NAME + process.env.EXT_OUT;
    console.log(`Écriture du fichier ${fileNameOut}`);
    fs.writeFileSync(fileNameOut, listTransCSV.join("\n"));

    console.log(`🏁🏁 Fin du programme avec succès - ${listTrans.length} transactions traitées`, account);
} catch (error) {
    console.log(`💥 CATCH 💥`);
    console.error(error);
}
