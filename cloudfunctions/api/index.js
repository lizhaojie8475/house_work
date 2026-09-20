const cloud = require('wx-server-sdk');
const { createRouter } = require('./lib/router');
const { createRepo } = require('./lib/repo');
const actions = require('./actions');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const repo = createRepo(db, db.command);

const handle = createRouter({
  actions,
  // OPENID 由微信侧注入，客户端无法伪造，是整套鉴权的信任根。
  getOpenid: () => cloud.getWXContext().OPENID,
  getRepo: () => repo,
  logger: console,
});

exports.main = (event) => handle(event);
