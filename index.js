const axios = require('axios')
const dedent = require('dedent-js')
const express = require('express')
const ejs = require('ejs')
const mysql = require('mysql')
const config = require('./config.json')
const { Webhook } = require('discord-webhook-node');

// price change
const app = express()
const dbEnabled = config.database.host.length > 0
const pool = dbEnabled ? mysql.createPool(config.database) : null
const webhook1 = new Webhook(config.floorChange)
// threshold
const webhook2 = new Webhook(config.floorThreshold)
const minThreshold = config.minThreshold
const maxThreshold = config.maxThreshold
let previousOS = null
let previousLR = null
let currentMinute = Math.round(Date.now() / 60000)
const slug = config.slug
const address = config.contractAddress
const thresholdText = config.thresholdText

const maxEntries = config.webMaxEntries
const interval = config.interval
let cache = []

function renderFile(filename, data = {}) {
    return new Promise((resolve, reject) => {
        filename = `templates/${filename}.ejs`
        ejs.renderFile(filename, data, {}, function (err, str) {
            if (err) { reject(err); return }
            resolve(str)
        })
    })
}

app.get('/', async (req, res) => {
    res.send(await renderFile('index', {slug}))
})
app.get('/api/stats', async (req, res) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.json(cache)
})

function min(a, b) {
    if (a === 0) return b
    if (b === 0) return a
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
async function updateCache() {
    let results = await query(`SELECT * FROM (SELECT * FROM wb_wolf ORDER BY timestamp DESC LIMIT ${maxEntries})Var1 ORDER BY timestamp ASC`)
    cache = []
    for (let result of results) {
        if (result.timestamp % interval === 0) cache.push([result.timestamp, result.value === 0 ? null : result.value])
    }
}

async function getOSPrice() {
    try {
        let data = await axios.get(`https://api.opensea.io/api/v1/collection/${slug}/stats`)
        return data.data.stats.floor_price
    } catch (e) {
        if (previousOS) return previousOS
        else throw e
    }
}
async function getLRPrice() {
    try {
        let data = await axios.get(`https://api.looksrare.org/api/v1/collections/stats?address=${address}`)
        return Math.round(data.data.data.floorPrice / 100000000000000) / 10000
    } catch (e) {
        if (previousLR) return previousLR
        else throw e
    }
}
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))


function start() {
    (async () => {
        console.log('Initializing...')
        if (!isNaN(parseInt(config.port.toString())) && config.port !== 0) app.listen(config.port)
        previousOS = await getOSPrice()
        previousLR = await getLRPrice()
        if (dbEnabled) await updateCache()
        console.log(`Successfully initialized.`)
        while (true) {
            let current = await getOSPrice()
            if (current !== previousOS) {
                if (current < minThreshold) {
                    await webhook2.send(dedent(
                        `📉 **New low FP**: ${current}Ξ
                        Previous FP: ${previousOS}Ξ
                        Service: OpenSea
                        Collection slug: ${slug}
                        OS Link: <https://opensea.io/collection/${slug}>
                        ${thresholdText.length > 0 ? thresholdText : ''}`))
                } else if (current > maxThreshold) {
                    await webhook2.send(dedent(
                        `📈 **New HIGH FP**: ${current}Ξ
                        Previous FP: ${previousOS}Ξ
                        Service: OpenSea
                        Collection slug: ${slug}
                        OS Link: <https://opensea.io/collection/${slug}>
                        ${thresholdText.length > 0 ? thresholdText : ''}`))
                }
                await webhook1.send(dedent(
                    `New FP: ${current}Ξ
                    Previous FP: ${previousOS}Ξ
                    Service: OpenSea
                    Collection slug: ${slug}
                    OS Link: <https://opensea.io/collection/${slug}>`
                ))
                previousOS = current
            }
            if (config.LREnabled) {
                current = await getLRPrice()
                if (current !== previousLR) {
                    if (current < minThreshold) {
                        await webhook2.send(dedent(
                            `📉 **New low FP**: ${current}Ξ
                        Previous FP: ${previousLR}Ξ
                        Service: LooksRare
                        Collection Address: ${address}
                        LR Link: <https://looksrare.org/collections/${address}>
                        ${thresholdText.length > 0 ? thresholdText : ''}`))
                    } else if (current > maxThreshold) {
                        await webhook2.send(dedent(
                            `📈 **New HIGH FP**: ${current}Ξ
                        Previous FP: ${previousLR}Ξ
                        Service: LooksRare
                        Collection Address: ${address}
                        LR Link: <https://looksrare.org/collections/${address}>
                        ${thresholdText.length > 0 ? thresholdText : ''}`))
                    }
                    await webhook1.send(dedent(
                        `New FP: ${current}Ξ
                    Previous FP: ${previousLR}Ξ
                    Service: LooksRare
                    Collection Address: ${address}
                    LR Link: <https://looksrare.org/collections/${address}>`
                    ))
                    previousLR = current
                }
            }
            if (Math.round(Date.now() / 60000) !== currentMinute && dbEnabled) {
                currentMinute = Math.round(Date.now() / 60000)
                try {
                    await query(`INSERT INTO wb_wolf (timestamp, value) VALUES (${currentMinute}, ${config.LREnabled ? min(previousOS, previousLR) : previousOS})`)
                    if (currentMinute % interval === 0) {
                        cache.push([currentMinute, config.LREnabled ? min(previousOS, previousLR) : previousOS])
                        if (cache.length > maxEntries) {
                            cache = cache.slice(1)
                        }
                    }
                } catch {}
            }
            await sleep(10000)
        }
    })()
}
start()