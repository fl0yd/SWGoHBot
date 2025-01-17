const Command = require("../base/Command");

class Charactergear extends Command {
    constructor(Bot) {
        super(Bot, {
            name: "charactergear",
            category: "Star Wars",
            aliases: ["chargear", "gear"],
            permissions: ["EMBED_LINKS"],
            flags: {
                all: {
                    aliases: ["recipes", "recs", "a", "expand"]
                }
            }
        });
    }

    async run(Bot, message, [userID, ...searchChar], options) {
        // The current max possible gear level
        const MAX_GEAR = 13;
        let gearLvl = 0;
        // If there's enough elements in searchChar, and it's in the format of a number*
        if (searchChar.length > 0 && !isNaN(parseInt(searchChar[searchChar.length-1]))) {
            gearLvl = parseInt(searchChar.pop());
            if (gearLvl < 0 || gearLvl > MAX_GEAR) {
                return message.channel.send(message.language.get("COMMAND_CHARACTERGEAR_INVALID_GEAR"));
            } else {
                if (gearLvl < 1 || gearLvl > MAX_GEAR || isNaN(parseInt(gearLvl)) ) {
                    gearLvl = 0;
                } else {
                    // There is a valid gear level being requested
                    gearLvl = parseInt(gearLvl);
                }
            }
        }

        // Need to get the allycode from the db, then use that
        if (!userID) {
            return message.channel.send(message.language.get("BASE_SWGOH_MISSING_CHAR"));
        } else if (userID !== "me" && !Bot.isAllyCode(userID) && !Bot.isUserID(userID)) {
            // If they're just looking for a character for themselves, get the char
            searchChar = userID + " " + searchChar;
            searchChar = searchChar.trim();
            userID = null;
        }
        if (userID) {
            const allyCodes = await Bot.getAllyCode(message, userID);
            if (!allyCodes.length) {
                return message.channel.send(message.language.get("BASE_SWGOH_NO_ALLY", message.guildSettings.prefix));
            } else if (allyCodes.length > 1) {
                return message.channel.send("Found " + allyCodes.length + " matches. Please try being more specific");
            }
            userID = allyCodes[0];
        }

        if (Array.isArray(searchChar)) {
            searchChar = searchChar.join(" ");
        }

        if (!searchChar || !searchChar.length) {
            return message.channel.send(message.language.get("BASE_SWGOH_MISSING_CHAR"));
        }
        const chars = Bot.findChar(searchChar, Bot.characters);

        let character;
        if (chars.length === 0) {
            return message.channel.send(message.language.get("BASE_SWGOH_NO_CHAR_FOUND", searchChar));
        } else if (chars.length > 1) {
            const charL = [];
            const charS = chars.sort((p, c) => p.name > c.name ? 1 : -1);
            charS.forEach(c => {
                charL.push(c.name);
            });
            return message.channel.send(message.language.get("BASE_SWGOH_CHAR_LIST", charL.join("\n")));
        } else {
            character = chars[0];
        }


        const char = await Bot.swgohAPI.getCharacter(character.uniqueName);
        if (!userID) {
            if (!gearLvl) {
                const allGear = {};
                let allGearList = [];
                char.unitTierList.forEach(gTier => {
                    if (options.flags.all) {
                        allGearList = allGearList.concat(gTier.equipmentSetList);
                    } else {
                        gTier.equipmentSetList.forEach(g => {
                            if (g === "???????") return;
                            if (!allGear[g]) { // If it's not been checked yet
                                allGear[g] = 1;
                            } else { // It's already in there
                                allGear[g] = allGear[g] + 1;
                            }
                        });
                    }
                });

                let gearString = "";
                if (options.flags.all) {
                    allGearList = allGearList.filter(g => g !== "???????");
                    const out = await expandPieces(Bot, allGearList);
                    const outK = Object.keys(out).sort((a, b) => parseInt(out[a].mark) - parseInt(out[b].mark));
                    gearString = Bot.expandSpaces(outK.map(g =>  "* " + " ".repeat(3 - out[g].count.toString().length) + out[g].count + "x " + g).join("\n"));
                } else {
                    const sortedGear = Object.keys(allGear).sort((a, b) => {
                        a = a.split(" ")[1];
                        b = b.split(" ")[1];
                        if (isNaN(a)) a = 0;
                        if (isNaN(b)) b = 0;

                        return a - b;
                    });
                    for (var key of sortedGear) {
                        gearString += `* ${allGear[key]}x ${key}\n`;
                    }
                }
                message.channel.send(message.language.get("COMMAND_CHARACTERGEAR_GEAR_ALL", character.name, gearString), {
                    code: "md",
                    split: true
                });
            } else {
                // Format and send the requested data back
                const gearList = char.unitTierList.filter(t => t.tier >= gearLvl);
                const fields = [];
                for (const g of gearList) {
                    let f;
                    if (options.flags.all) {
                        const out = await expandPieces(Bot, g.equipmentSetList);
                        const outK = Object.keys(out).sort((a, b) => parseInt(out[a].mark) - parseInt(out[b].mark));

                        f = {
                            name: `Gear Lvl ${g.tier}`,
                            value: Bot.expandSpaces(outK.map(g =>  "**" + out[g].count + "x** " + " ".repeat(3 - out[g].count.toString().length) + g).join("\n"))
                        };
                    } else {
                        f = {
                            name: "Gear " + g.tier,
                            value: g.equipmentSetList.filter(gname => gname !== "???????").join("\n")
                        };
                    }
                    if (f.value.length > 0) {
                        fields.push(f);
                    }
                }
                message.channel.send({
                    embed: {
                        "color": `${character.side === "light" ? 0x5114e0 : 0xe01414}`,
                        "author": {
                            "name": character.name,
                            "url": character.url,
                            "icon_url": character.avatarURL
                        },
                        "fields": fields
                    }
                });
            }
        } else {
            // Looking for a player's remaining needed gear
            const cooldown = Bot.getPlayerCooldown(message.author.id);
            const player = await Bot.swgohAPI.player(userID, message.guildSettings.swgohLanguage, cooldown);
            const playerChar = player.roster.find(c => c.defId === character.uniqueName);

            if (!playerChar) {
                return super.error(message, "Looks like you don't have this character unlocked");
            } else {
                // They do have the character unlocked.
                // Need to filter out the gear that they already have assigned to the character, then show them what's left

                if (gearLvl && gearLvl < playerChar.gear) {
                    return super.error(message, "Looks like you already have all the gear equipped for that level", {title: "Already There"});
                }

                const gearList = char.unitTierList.filter(t => t.tier >= playerChar.gear);

                const fields = [];
                for (const [ix, g] of gearList.entries()) {
                    // Take out any that are already equipped
                    if (gearLvl > 0 && g.tier > gearLvl) return;
                    if (g.tier === playerChar.gear) {
                        const toRemove = playerChar.equipped.map(eq => eq.slot);
                        while (toRemove.length) {
                            g.equipmentSetList.splice(toRemove.pop(), 1);
                        }
                    }
                    // Take out the unknown ones
                    if (g.equipmentSetList.indexOf("???????") > -1) {
                        g.equipmentSetList.splice(g.equipmentSetList.indexOf("???????"), 1);
                    }
                    if (g.tier === 12 && ix === 0 && g.equipmentSetList.length === 0) {
                        fields.push({
                            name: "Congrats!",
                            value: "Look like you have the gear maxed out for " + character.name
                        });
                    } else {
                        if (options.flags.all) {
                        // If they want all the pieces, work on that

                            const out = await expandPieces(Bot, g.equipmentSetList);
                            const outK = Object.keys(out).sort((a, b) => parseInt(out[a].mark) - parseInt(out[b].mark));

                            fields.push({
                                name: `Gear Lvl ${g.tier}`,
                                value: Bot.expandSpaces(outK.map(g =>  "**" + out[g].count + "x** " + " ".repeat(3 - out[g].count.toString().length) + g).join("\n"))
                            });
                        } else {
                            fields.push({
                                name: `Gear Lvl ${g.tier}`,
                                value: g.equipmentSetList.join("\n")
                            });
                        }
                    }
                }
                if (player.warnings) {
                    fields.push({
                        name: "Warnings",
                        value: player.warnings.join("\n")
                    });
                }
                const footer = Bot.updatedFooter(player.updated, message, "player", cooldown);
                message.channel.send({embed: {
                    author: {
                        name: (gearLvl > 0) ? `${player.name}'s ${character.name} gear til g${gearLvl}` : `${player.name}'s ${character.name} needs:`
                    },
                    fields: fields,
                    footer: footer
                }});
            }
        }
    }
}

module.exports = Charactergear;

async function expandPieces(Bot, list) {
    let end = [];
    for (const piece of list) {
        const gr = await Bot.cache.get(Bot.config.mongodb.swapidb, "gear", {
            nameKey: piece,
            language: "eng_us"
        }, {
            nameKey: 1,
            recipeId: 1,
            _id: 0
        });

        const pieces = await getParts(Bot, gr);
        end = end.concat(pieces);
    }

    const out = {};
    end.forEach(g => {
        if (out[g.name]) {
            out[g.name].count += g.count;
        } else {
            out[g.name] = {
                count: g.count,
                mark: g.mark
            };
        }
    });
    return out;
}

async function getParts(Bot, gr, partList=[], amt=1) {
    if (Array.isArray(gr)) gr = gr[0];
    if (!gr) return;
    if (gr.recipeId && gr.recipeId.length) {
        let rec = await Bot.cache.get(Bot.config.mongodb.swapidb, "recipes", {
            id: gr.recipeId,
            language: "eng_us"
        },
        {
            ingredientsList: 1,
            _id: 0
        });
        if (Array.isArray(rec)) rec = rec[0];
        if (rec.ingredientsList) rec = rec.ingredientsList.filter(r => r.id !== "GRIND");
        for (const r of rec) {
            const gear = await Bot.cache.get(Bot.config.mongodb.swapidb, "gear", {
                id: r.id,
                language: "eng_us"
            }, {
                nameKey: 1,
                recipeId: 1,
                _id: 0
            });
            await getParts(Bot, gear, partList, amt * r.maxQuantity);
        }
    } else {
        let mk = gr.nameKey.split(" ")[1];
        mk = isNaN(mk) ? -20 : mk;
        partList.push({name: gr.nameKey, count: amt, mark: mk});
    }

    return partList;
}
