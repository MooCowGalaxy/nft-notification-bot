const axios = require('axios')
const dedent = require('dedent-js')
const mysql = require('mysql')
const config = require('./config.json')
const { Webhook } = require('discord-webhook-node');

// price change
const pool = mysql.createPool(config.database)
const webhook1 = new Webhook(config.floorChange)
// threshold
const webhook2 = new Webhook(config.floorLow)
const threshold = config.threshold
let previousOS = null
let previousLR = null
let currentMinute = new Date().getMinutes()
const slug = config.slug
const address = config.contractAddress
const ownerId = config.ownerId

function min(a, b) {
    let res = a < b ? a : b
    return res === Infinity ? 0 : res
}
function query(statement) {
    return new Promise((resolve, reject) => {
        pool.getConnection(function (err, connection) {
            if (err) { reject(err); return }
            connection.query(statement, function (err, results) {
                connection.release()
                if (err) { reject(err); return }
                resolve(results)
            })
        })
    })
}
function e(o) {
    return pool.escape(o)
}

async function getOSPrice() {
    let data = await axios.get(`https://api.opensea.io/api/v1/collection/${slug}/stats`)
    return data.data.stats.floor_price
}
async function getLRPrice() {
    let data = await axios.get(`https://api.looksrare.org/api/v1/collections/stats?address=${address}`)
    return Math.round(data.data.data.floorPrice / 100000000000000) / 10000
}
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

function start() {
    (async () => {
        console.log('Initializing...')
        previousOS = await getOSPrice()
        previousLR = await getLRPrice()
        console.log(`Successfully initialized.`)
        while (true) {
            let current = await getOSPrice()
            if (current !== previousOS) {
                if (current < threshold) {
                    await webhook2.send(dedent(
                        `**New low FP**: ${current}Ξ
                        Previous FP: ${previousOS}Ξ
                        Service: OpenSea
                        Collection slug: ${slug}
                        OS Link: <https://opensea.io/collection/${slug}>
                        ${ownerId.length > 0 ? `<@${ownerId}>` : ''}`))
                }
                await webhook1.send(dedent(
                    `New FP: ${current}Ξ
                    Previous FP: ${previousOS}Ξ
                    Service: OpenSea
                    Collection slug: ${slug}
                    OS Link: <https://opensea.io/collection/${slug}>
                    ${ownerId.length > 0 ? `<@${ownerId}>` : ''}`
                ))
                previousOS = current
            }
            current = await getLRPrice()
            if (current !== previousLR) {
                if (current < threshold) {
                    await webhook2.send(dedent(
                        `**New low FP**: ${current}Ξ
                        Previous FP: ${previousLR}Ξ
                        Service: LooksRare
                        Collection Address: ${address}
                        LR Link: <https://looksrare.org/collections/${address}>
                        ${ownerId.length > 0 ? `<@${ownerId}>` : ''}`
                    ))
                }
                await webhook1.send(dedent(
                    `New FP: ${current}Ξ
                    Previous FP: ${previousLR}Ξ
                    Service: LooksRare
                    Collection Address: ${address}
                    LR Link: <https://looksrare.org/collections/${address}>
                    ${ownerId.length > 0 ? `<@${ownerId}>` : ''}`
                ))
                previousLR = current
            }
            if (new Date().getMinutes() !== currentMinute) {
                currentMinute = new Date().getMinutes()
                await query(`INSERT INTO wb_wolf (timestamp, value) VALUES (${currentMinute}, ${min(previousOS, previousLR)})`)
            }
            await sleep(12000)
        }
    })()
}
start()