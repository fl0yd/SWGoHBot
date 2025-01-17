const Command = require("../base/Command");
const moment = require("moment");
require("moment-duration-format");

class CheckAct extends Command {
    constructor(Bot) {
        super(Bot, {
            name: "checkactivity",
            aliases: ["activity", "check", "ca"],
            guildOnly: true,
            permLevel: 3,
            category: "Admin",
            flags: {},
            subArgs: {
                sort: {         // Sort by name or time
                    aliases: []
                },
                time: {         // Filter based on them being inactive past x hours
                    aliases: ["hour", "hours"]
                },
                role: {         // Filter the list to a single role
                    aliases: []
                },
                // ingame: {       // Show the last active times based on their in-game lastActivity
                //     aliases: ["ig"]
                // }
            }
        });
    }

    async run(Bot, message, args, options) {
        if (!message.guildSettings.useActivityLog) {
            return super.error(message, message.language.get("COMMAND_CHECKACTIVITY_NOT_ACTIVE"));
        }

        let userID = args[0];
        let activityLog = await Bot.cache.get(Bot.config.mongodb.swgohbotdb, "activityLog", {guildID: message.guild.id});
        if (Array.isArray(activityLog)) activityLog = activityLog[0];
        if (!userID) {
            // List everything for that server (With limitations)
            let objArr = Object.keys(activityLog.log).map(u => {
                return {
                    user: u,
                    time: activityLog.log[u]
                };
            });
            for (const u of objArr) {
                const user = await message.guild.members.get(u.user);
                if (!user || user.user.bot) {
                    u.user = null;
                } else {
                    u.user = Bot.truncate(user.nickname ? user.nickname : user.user.username, 20);
                    u.roles = user.roles;
                }
            }
            // Remove any bots
            objArr = objArr.filter(u => u.user !== null);
            if (options.subArgs.time && !isNaN(options.subArgs.time)) {
                // Convert the time from hours to milliseconds
                //                                   ms    sec  min
                const time = options.subArgs.time * 1000 * 60 * 60;
                // Filter out anyone that has been inactive for longer than x hours
                objArr = objArr.filter(u => {
                    const diff = moment().diff(moment(u.time));
                    return diff >= time;
                });
            }
            if (options.subArgs.role && options.subArgs.role.length > 0) {
                // Filter out anyone that does not have the specified role (Name or mention/ id)
                const roleNId = options.subArgs.role;
                // Try finding by ID first
                let role = message.guild.roles.get(roleNId.replace(/[^0-9]/gi, ""));
                if (!role) {
                    // If it can't find the role by ID, try by name
                    role = message.guild.roles.find(r => r.name === roleNId);
                }
                if (!role) {
                    // If it can't find it by role or name, error
                    return super.error(message, message.language.get("COMMAND_CHECKACTIVITY_NO_ROLE", roleNId));
                }
                // Now that we have a role, filter out anyone that doens't have it
                objArr = objArr.filter(u => {
                    const outRole = u.roles.find(r => r.id === role.id);
                    return !outRole ? false : true;
                });
            }
            if (options.subArgs.sort && options.subArgs.sort.toLowerCase() === "name") {
                // If they want to sort by name, do so
                objArr = objArr.sort((a, b) => a.user.toLowerCase() > b.user.toLowerCase() ? 1 : -1);
            } else {
                // Otherwise, sort by how recently they've been on
                objArr = objArr.sort((a, b) => b.time - a.time);
            }
            // If there's no one left after filtering everyone out, let em know
            if (!objArr.length) return super.error(message, message.language.get("COMMAND_CHECKACTIVITY_NO_MATCH"), {title: message.language.get("COMMAND_CHECKACTIVITY_NO_MATCH_TITLE")});
            // Convert the time from a unix-format time string into something human readable
            objArr = objArr.map(u => {
                u.time = getTime(moment().diff(moment(u.time)), true);
                return u;
            });

            // Limit it to 50 people if there are more
            if (objArr.length > 50) {
                objArr = objArr.slice(0, 100);
            }

            // Format the output into a table so it looks nice
            const headerValues = message.language.get("COMMAND_CHECKACTIVITY_TABLE_HEADERS");
            const outArr = Bot.makeTable({
                user: {value: headerValues.user, startWith: "`", endWith: "|", align: "left"},
                time: {value: headerValues.time, endWith: "`"}
            }, objArr);

            const fields = Bot.msgArray(outArr, "\n", 700).map(m => {
                return {name: "-", value: m};
            });

            const desc = fields.shift();
            return message.channel.send({embed: {
                author: {name: message.language.get("COMMAND_CHECKACTIVITY_LOG_HEADER", message.guild.name, objArr.length)},
                description: desc.value,
                fields: fields,
                color: 0x00FF00
            }});
        } else {
            // Make sure it's a valid userID
            if (!Bot.isUserID(userID)) {
                return super.error(message, message.language.get("COMMAND_CHECKACTIVITY_INVALID_USER"));
            }
            userID = Bot.getUserID(userID);
            const user = message.guild.members.get(userID);
            const name = user.nickname ? user.nickname : user.user.username;
            // Try and check the activity for just one user
            if (activityLog.log[userID]) {
                // Spit out user's last activity
                const lastActive = activityLog.log[userID];
                const diff = moment().diff(moment(lastActive));

                return super.error(message, message.language.get("COMMAND_CHECKACTIVITY_USER_CHECK", name, getTime(diff)), {title: message.language.get("COMMAND_CHECKACTIVITY_USER_CHECK_HEADER"), color: 0x00FF00});
            } else {
                return super.error(message, message.language.get("COMMAND_CHECKACTIVITY_NO_USER"));
            }
        }
        function getTime(diff, numOnly) {
            const days = 1000 * 60 * 60 * 24;
            const hours= 1000 * 60 * 60;
            const mins = 1000 * 60;

            let out = diff / days;
            if (out > 1) {
                return (out < 10 ? " " : "") + out.toFixed(1) + (numOnly ? "d" : " days");
            }
            out = diff / hours;
            if (out > 1) {
                return (out < 10 ? " " : "") + out.toFixed(1) + (numOnly ? "h" : " hours");
            }
            out = diff / mins;
            return (out < 10 ? "   " : "  ") + parseInt(out) + (numOnly ? "m" : " minutes");
        }
    }
}

module.exports = CheckAct;









