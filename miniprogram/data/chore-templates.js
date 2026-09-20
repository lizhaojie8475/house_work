// 内置家务模板库。前端本地静态数据，不占数据库、不需联网。
// 周期为推荐值，用户导入后可自行调整。
const ROOMS = ['厨房', '卫生间', '卧室', '客厅', '阳台', '全屋'];

const CHORE_TEMPLATES = [
  // 厨房
  { id: 'kitchen-hood', name: '洗油烟机', icon: '🔥', room: '厨房', scheduleType: 'floating', intervalDays: 90, estimatedMinutes: 60, notes: '先拆滤网泡热水加洗涤剂，扇叶用专用清洁剂喷后静置 10 分钟' },
  { id: 'kitchen-sink-drain', name: '疏通厨房下水道', icon: '🚰', room: '厨房', scheduleType: 'floating', intervalDays: 60, estimatedMinutes: 20, notes: '倒管道疏通剂后静置 30 分钟，再用大量常温清水冲净；强碱疏通剂遇热水易回溅' },
  { id: 'kitchen-fridge', name: '清理冰箱', icon: '🧊', room: '厨房', scheduleType: 'floating', intervalDays: 30, estimatedMinutes: 40, notes: '清过期食品，隔板取出用小苏打水擦' },
  { id: 'kitchen-microwave', name: '清洁微波炉', icon: '📻', room: '厨房', scheduleType: 'floating', intervalDays: 30, estimatedMinutes: 15, notes: '一碗水加柠檬片高火 3 分钟，蒸汽软化油污后擦拭' },
  { id: 'kitchen-dishwasher', name: '洗碗机自清洁', icon: '🍽️', room: '厨房', scheduleType: 'floating', intervalDays: 30, estimatedMinutes: 10, notes: '清滤网残渣，放专用清洁剂跑一次空载高温程序' },
  { id: 'kitchen-cabinet', name: '整理橱柜与调料', icon: '🧂', room: '厨房', scheduleType: 'floating', intervalDays: 90, estimatedMinutes: 45, notes: '查看调料保质期，擦拭柜内层板' },
  { id: 'kitchen-trash', name: '刷洗垃圾桶', icon: '🗑️', room: '厨房', scheduleType: 'floating', intervalDays: 14, estimatedMinutes: 15, notes: '' },
  { id: 'kitchen-kettle', name: '除水垢（热水壶）', icon: '🫖', room: '厨房', scheduleType: 'floating', intervalDays: 60, estimatedMinutes: 20, notes: '白醋加水煮开静置 1 小时后冲洗' },

  // 卫生间
  { id: 'bath-toilet', name: '刷马桶', icon: '🚽', room: '卫生间', scheduleType: 'floating', intervalDays: 7, estimatedMinutes: 10, notes: '洁厕剂沿内壁一圈，静置 5 分钟再刷' },
  { id: 'bath-floor-drain', name: '清理地漏', icon: '🕳️', room: '卫生间', scheduleType: 'floating', intervalDays: 14, estimatedMinutes: 10, notes: '取出内芯清头发，回装前检查密封' },
  { id: 'bath-shower-head', name: '除垢花洒', icon: '🚿', room: '卫生间', scheduleType: 'floating', intervalDays: 90, estimatedMinutes: 30, notes: '拆下泡白醋 1 小时，用牙刷刷出水孔' },
  { id: 'bath-mirror', name: '擦浴室镜与玻璃隔断', icon: '🪞', room: '卫生间', scheduleType: 'floating', intervalDays: 14, estimatedMinutes: 15, notes: '用刮水器从上往下，减少水痕' },
  { id: 'bath-towel', name: '换洗浴巾毛巾', icon: '🧻', room: '卫生间', scheduleType: 'fixed', fixedRule: { type: 'weekly', weekdays: [6] }, estimatedMinutes: 10, notes: '' },
  { id: 'bath-grout', name: '清洁瓷砖缝霉斑', icon: '🧽', room: '卫生间', scheduleType: 'floating', intervalDays: 60, estimatedMinutes: 40, notes: '除霉喷剂静置 15 分钟，开排风扇' },
  { id: 'bath-washer-clean', name: '洗衣机自清洁', icon: '🧺', room: '卫生间', scheduleType: 'floating', intervalDays: 30, estimatedMinutes: 90, notes: '用筒自洁模式，投 1 包洗衣机清洁剂，结束后擦干门封圈' },
  { id: 'bath-washer-filter', name: '清洗洗衣机过滤网', icon: '🧷', room: '卫生间', scheduleType: 'floating', intervalDays: 30, estimatedMinutes: 15, notes: '' },

  // 卧室
  { id: 'bed-sheets', name: '换床单', icon: '🛏️', room: '卧室', scheduleType: 'fixed', fixedRule: { type: 'weekly', weekdays: [0] }, estimatedMinutes: 20, notes: '' },
  { id: 'bed-pillow', name: '洗枕套与枕芯', icon: '🛌', room: '卧室', scheduleType: 'floating', intervalDays: 7, estimatedMinutes: 30, notes: '枕套建议与床单每周换洗；枕芯按洗标和实际需要清洗，多数可低温机洗后彻底晾干' },
  { id: 'bed-quilt-sun', name: '晒被子', icon: '☀️', room: '卧室', scheduleType: 'floating', intervalDays: 30, estimatedMinutes: 20, notes: '选晴天上午 10 点到下午 3 点' },
  { id: 'bed-mattress', name: '翻转除螨床垫', icon: '🧹', room: '卧室', scheduleType: 'floating', intervalDays: 90, estimatedMinutes: 40, notes: '吸尘后撒小苏打静置 1 小时再吸走；先看标签是否可翻面，单面床垫只调头不翻转' },
  { id: 'bed-wardrobe', name: '整理换季衣物', icon: '👕', room: '卧室', scheduleType: 'fixed', fixedRule: { type: 'yearly', month: 4, dayOfMonth: 15 }, estimatedMinutes: 120, notes: '收纳前彻底晾干，放防虫片' },

  // 客厅
  { id: 'living-robot-vacuum', name: '清洗扫地机器人', icon: '🤖', room: '客厅', scheduleType: 'floating', intervalDays: 14, estimatedMinutes: 25, notes: '清空尘盒、刷主刷毛发、洗拖布、擦传感器与滚轮' },
  { id: 'living-robot-filter', name: '更换扫地机滤网', icon: '🌀', room: '客厅', scheduleType: 'floating', intervalDays: 90, estimatedMinutes: 10, notes: '' },
  { id: 'living-sofa', name: '吸尘沙发与坐垫', icon: '🛋️', room: '客厅', scheduleType: 'floating', intervalDays: 30, estimatedMinutes: 25, notes: '掀起坐垫吸缝隙' },
  { id: 'living-ac-filter', name: '清洗空调滤网', icon: '❄️', room: '客厅', scheduleType: 'floating', intervalDays: 60, estimatedMinutes: 30, notes: '断电后取滤网冲洗，彻底阴干再装回' },
  { id: 'living-tv', name: '擦电视与电器除尘', icon: '📺', room: '客厅', scheduleType: 'floating', intervalDays: 14, estimatedMinutes: 15, notes: '屏幕用干燥超细纤维布，不可喷水' },
  { id: 'living-plants', name: '浇花', icon: '🪴', room: '客厅', scheduleType: 'floating', intervalDays: 3, estimatedMinutes: 10, notes: '指插土面 2 厘米，干了再浇，浇透至底部出水' },
  { id: 'living-plant-fertilize', name: '给植物施肥', icon: '🌱', room: '客厅', scheduleType: 'floating', intervalDays: 30, estimatedMinutes: 15, notes: '生长期施薄肥，休眠期停' },

  // 阳台
  { id: 'balcony-windows', name: '擦玻璃', icon: '🪟', room: '阳台', scheduleType: 'floating', intervalDays: 90, estimatedMinutes: 60, notes: '先洗后刮，阴天擦不易留印' },
  { id: 'balcony-screen', name: '洗纱窗', icon: '🕸️', room: '阳台', scheduleType: 'floating', intervalDays: 180, estimatedMinutes: 45, notes: '可用海绵夹住双面擦，无需拆卸' },
  { id: 'balcony-drain', name: '清理阳台地漏与排水', icon: '💧', room: '阳台', scheduleType: 'floating', intervalDays: 90, estimatedMinutes: 15, notes: '雨季前务必检查' },
  { id: 'balcony-dryer', name: '擦晾衣架与晾衣杆', icon: '🧷', room: '阳台', scheduleType: 'floating', intervalDays: 60, estimatedMinutes: 15, notes: '' },

  // 全屋
  { id: 'home-mop', name: '拖地', icon: '🧹', room: '全屋', scheduleType: 'floating', intervalDays: 3, estimatedMinutes: 30, notes: '' },
  { id: 'home-dust', name: '全屋除尘（灯具、踢脚线）', icon: '🪶', room: '全屋', scheduleType: 'floating', intervalDays: 30, estimatedMinutes: 45, notes: '从高到低，先掸后拖' },
  { id: 'home-door-handle', name: '消毒门把手与开关', icon: '🚪', room: '全屋', scheduleType: 'floating', intervalDays: 14, estimatedMinutes: 10, notes: '' },
  { id: 'home-water-filter', name: '更换净水器滤芯', icon: '🚱', room: '全屋', scheduleType: 'floating', intervalDays: 180, estimatedMinutes: 30, notes: '记录滤芯型号，换后冲洗 10 分钟再饮用' },
  { id: 'home-smoke-alarm', name: '检查烟感与燃气报警器', icon: '🚨', room: '全屋', scheduleType: 'fixed', fixedRule: { type: 'monthly', dayOfMonth: 1 }, estimatedMinutes: 10, notes: '按测试键听是否报警，电池低电及时换' },
  { id: 'home-medicine', name: '清理过期药品', icon: '💊', room: '全屋', scheduleType: 'floating', intervalDays: 180, estimatedMinutes: 20, notes: '过期药按有害垃圾投放' },
  { id: 'home-deep-clean', name: '大扫除', icon: '✨', room: '全屋', scheduleType: 'fixed', fixedRule: { type: 'yearly', month: 1, dayOfMonth: 20 }, estimatedMinutes: 240, notes: '' },
];

function templatesByRoom() {
  const grouped = {};
  ROOMS.forEach((room) => {
    grouped[room] = CHORE_TEMPLATES.filter((t) => t.room === room);
  });
  return grouped;
}

module.exports = { ROOMS, CHORE_TEMPLATES, templatesByRoom };
