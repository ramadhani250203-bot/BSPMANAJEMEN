const express=require("express");
const session=require("express-session");
const Database=require("better-sqlite3");
const bcrypt=require("bcryptjs");
const path=require("path");
const fs=require("fs");

const app=express();
const PORT=process.env.PORT||3000;
const DATA=path.join(__dirname,"data");
if(!fs.existsSync(DATA))fs.mkdirSync(DATA,{recursive:true});
const db=new Database(path.join(DATA,"bsp_baru.db"));
db.pragma("journal_mode=WAL");
db.pragma("foreign_keys=ON");

app.use(express.json({limit:"15mb"}));
app.use(express.urlencoded({extended:true,limit:"15mb"}));
app.use(session({secret:process.env.SESSION_SECRET||"BSP-BARU-2026",resave:false,saveUninitialized:false,cookie:{maxAge:86400000,httpOnly:true,sameSite:"lax"}}));
app.use(express.static(path.join(__dirname,"public")));

const now=()=>new Date().toISOString();
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta"}).format(new Date());
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clean=v=>String(v??"").trim();
const publicUser=u=>{if(!u)return null;const{x,...r}=u;delete r.password_hash;return r};
function auth(req,res,next){if(!req.session.user)return res.status(401).json({error:"Belum login"});next()}
function roles(...rs){return(req,res,next)=>{if(!req.session.user)return res.status(401).json({error:"Belum login"});if(!rs.includes(req.session.user.role))return res.status(403).json({error:"Akses ditolak"});next()}}
function orderNo(){const d=today().replaceAll("-","");const c=db.prepare("SELECT COUNT(*) c FROM orders WHERE order_date=?").get(today()).c+1;return`BSP-${d}-${String(c).padStart(4,"0")}`}

db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL,photo TEXT DEFAULT '',active INTEGER DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sales(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,name TEXT NOT NULL,phone TEXT DEFAULT '',active INTEGER DEFAULT 1,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS customers(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,phone TEXT DEFAULT '',address TEXT DEFAULT '',notes TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,category TEXT DEFAULT '',size TEXT DEFAULT '',unit TEXT DEFAULT 'pcs',selling_price REAL DEFAULT 0,stock REAL DEFAULT 0,min_stock REAL DEFAULT 0,active INTEGER DEFAULT 1,notes TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,order_no TEXT UNIQUE NOT NULL,customer_id INTEGER,sales_id INTEGER,order_date TEXT NOT NULL,status TEXT DEFAULT 'DIPROSES',subtotal REAL DEFAULT 0,discount_type TEXT DEFAULT 'PERCENT',discount_value REAL DEFAULT 0,discount_amount REAL DEFAULT 0,total REAL DEFAULT 0,notes TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL,FOREIGN KEY(sales_id) REFERENCES sales(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,product_id INTEGER NOT NULL,qty REAL NOT NULL,unit_price REAL NOT NULL,subtotal REAL NOT NULL,FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,FOREIGN KEY(product_id) REFERENCES products(id));
CREATE TABLE IF NOT EXISTS stock_movements(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,type TEXT NOT NULL,qty REAL NOT NULL,before_stock REAL DEFAULT 0,after_stock REAL DEFAULT 0,note TEXT DEFAULT '',user_id INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS machines(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,name TEXT NOT NULL,status TEXT DEFAULT 'MENUNGGU',notes TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS production_types(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE NOT NULL,active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS production_sizes(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE NOT NULL,active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS production_jobs(id INTEGER PRIMARY KEY AUTOINCREMENT,production_date TEXT NOT NULL,product_id INTEGER,type_id INTEGER,size_id INTEGER,target_qty REAL DEFAULT 0,completed_qty REAL DEFAULT 0,status TEXT DEFAULT 'BERJALAN',notes TEXT DEFAULT '',started_at TEXT DEFAULT CURRENT_TIMESTAMP,completed_at TEXT,FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL,FOREIGN KEY(type_id) REFERENCES production_types(id) ON DELETE SET NULL,FOREIGN KEY(size_id) REFERENCES production_sizes(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS production_job_assignments(id INTEGER PRIMARY KEY AUTOINCREMENT,production_job_id INTEGER NOT NULL,machine_id INTEGER NOT NULL,operator1_id INTEGER NOT NULL,operator2_id INTEGER,target_qty REAL DEFAULT 0,completed_qty REAL DEFAULT 0,status TEXT DEFAULT 'DITUGASKAN',started_at TEXT,completed_at TEXT,notes TEXT DEFAULT '',FOREIGN KEY(production_job_id) REFERENCES production_jobs(id) ON DELETE CASCADE,FOREIGN KEY(machine_id) REFERENCES machines(id),FOREIGN KEY(operator1_id) REFERENCES users(id),FOREIGN KEY(operator2_id) REFERENCES users(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS raw_materials(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,material_type TEXT DEFAULT 'OPP',thickness REAL DEFAULT 0,width REAL DEFAULT 0,length REAL DEFAULT 0,unit TEXT DEFAULT 'ROLL',stock REAL DEFAULT 0,min_stock REAL DEFAULT 0,weight_per_unit REAL DEFAULT 0,purchase_price REAL DEFAULT 0,supplier TEXT DEFAULT '',notes TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS raw_material_movements(id INTEGER PRIMARY KEY AUTOINCREMENT,raw_material_id INTEGER NOT NULL,type TEXT NOT NULL,qty REAL NOT NULL,before_stock REAL DEFAULT 0,after_stock REAL DEFAULT 0,note TEXT DEFAULT '',user_id INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(raw_material_id) REFERENCES raw_materials(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS product_materials(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,raw_material_id INTEGER NOT NULL,qty_per_unit REAL DEFAULT 0,weight_per_unit REAL DEFAULT 0,notes TEXT DEFAULT '',UNIQUE(product_id,raw_material_id),FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,FOREIGN KEY(raw_material_id) REFERENCES raw_materials(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS deliveries(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER,driver_id INTEGER,origin TEXT DEFAULT '',destination TEXT DEFAULT '',route TEXT DEFAULT '',latitude REAL,longitude REAL,goods TEXT DEFAULT '',status TEXT DEFAULT 'DIPERSIAPKAN',notes TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE SET NULL,FOREIGN KEY(driver_id) REFERENCES users(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS attendance_settings(id INTEGER PRIMARY KEY CHECK(id=1),work_start TEXT DEFAULT '08:00',work_end TEXT DEFAULT '16:00',late_tolerance_minutes INTEGER DEFAULT 15);
CREATE TABLE IF NOT EXISTS attendance(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,attendance_date TEXT NOT NULL,check_in TEXT,check_out TEXT,status TEXT DEFAULT 'HADIR',late_minutes INTEGER DEFAULT 0,work_minutes INTEGER DEFAULT 0,note TEXT DEFAULT '',UNIQUE(user_id,attendance_date),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS attendance_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,attendance_date TEXT NOT NULL,request_type TEXT NOT NULL,note TEXT DEFAULT '',status TEXT DEFAULT 'PENDING',created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
INSERT OR IGNORE INTO attendance_settings(id) VALUES(1);
`);

function seed(){
 if(db.prepare("SELECT COUNT(*) c FROM users").get().c===0){
  const ins=db.prepare("INSERT INTO users(name,username,password_hash,role) VALUES(?,?,?,?)");
  [["Administrator","admin","admin123","ADMIN"],["Sales BSP","sales","sales123","SALES"],["Operator Produksi","operator","operator123","OPERATOR"],["Packaging BSP","packaging","packaging123","PACKAGING"],["Gudang BSP","gudang","gudang123","GUDANG"],["Driver BSP","driver","driver123","DRIVER"]].forEach(x=>ins.run(x[0],x[1],bcrypt.hashSync(x[2],10),x[3]));
 }
 if(db.prepare("SELECT COUNT(*) c FROM machines").get().c===0){const s=db.prepare("INSERT INTO machines(code,name) VALUES(?,?)");for(let i=1;i<=6;i++)s.run(`M-${i}`,`Mesin ${i}`)}
 if(db.prepare("SELECT COUNT(*) c FROM sales").get().c===0){
  const s=db.prepare("INSERT INTO sales(name,phone) VALUES(?,?)");
  s.run("Sales BSP","081234567890");
 }
 if(db.prepare("SELECT COUNT(*) c FROM customers").get().c===0){
  const s=db.prepare("INSERT INTO customers(name,phone,address) VALUES(?,?,?)");
  s.run("Customer Umum","-","-");
 }
 if(db.prepare("SELECT COUNT(*) c FROM products").get().c===0){
  const s=db.prepare("INSERT INTO products(name,category,size,unit,selling_price,stock,min_stock) VALUES(?,?,?,?,?,?,?)");
  s.run("Plastik OPP 20 cm","Plastik OPP","20 cm","bal",50000,100,10);
  s.run("Plastik OPP 7 x 12 cm","Plastik OPP","7 x 12 cm","bal",35000,100,10);
 }
 if(db.prepare("SELECT COUNT(*) c FROM production_types").get().c===0){const s=db.prepare("INSERT INTO production_types(name) VALUES(?)");["Plastik OPP","Plastik Kemasan","Cetak","Lainnya"].forEach(x=>s.run(x))}
 if(db.prepare("SELECT COUNT(*) c FROM production_sizes").get().c===0){const s=db.prepare("INSERT INTO production_sizes(name) VALUES(?)");["7 x 12 cm","20 cm","Custom"].forEach(x=>s.run(x))}
}
seed();

app.get("/api/health",(req,res)=>res.json({ok:true,system:"BSP Management System Baru",database:"bsp_baru.db"}));
app.post("/api/login",(req,res)=>{const u=db.prepare("SELECT * FROM users WHERE username=? AND active=1").get(clean(req.body.username));if(!u||!bcrypt.compareSync(String(req.body.password||""),u.password_hash))return res.status(401).json({error:"Username atau password salah"});req.session.user=publicUser(u);res.json({ok:true,user:req.session.user})});
app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/me",auth,(req,res)=>res.json({user:req.session.user}));

app.get("/api/dashboard",auth,(req,res)=>{
 const revenue=db.prepare("SELECT COALESCE(SUM(total),0) v FROM orders WHERE status!='DIBATALKAN'").get().v;
 const orders=db.prepare("SELECT COUNT(*) c FROM orders WHERE status!='DIBATALKAN'").get().c;
 const prod=db.prepare("SELECT COALESCE(SUM(completed_qty),0) v FROM production_jobs WHERE production_date=?").get(today()).v;
 const low=db.prepare("SELECT COUNT(*) c FROM products WHERE active=1 AND stock<=min_stock").get().c;
 const att=db.prepare("SELECT COUNT(*) c FROM attendance WHERE attendance_date=? AND check_in IS NOT NULL").get(today()).c;
 const daily=db.prepare("SELECT order_date label,ROUND(SUM(total),0) value FROM orders WHERE status!='DIBATALKAN' AND order_date>=date('now','-6 day') GROUP BY order_date ORDER BY order_date").all();
 const top=db.prepare("SELECT p.name label,ROUND(SUM(oi.qty),2) value FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN products p ON p.id=oi.product_id WHERE o.status!='DIBATALKAN' GROUP BY p.id ORDER BY value DESC LIMIT 8").all();
 const sales=db.prepare("SELECT COALESCE(s.name,'Tanpa Sales') label,ROUND(SUM(o.total),0) value FROM orders o LEFT JOIN sales s ON s.id=o.sales_id WHERE o.status!='DIBATALKAN' GROUP BY o.sales_id ORDER BY value DESC").all();
 const salesTotal=sales.reduce((a,x)=>a+num(x.value),0);
 sales.forEach(x=>x.percent=salesTotal?Math.round((num(x.value)/salesTotal)*10000)/100:0);
 res.json({stats:{revenue,orders,production:prod,lowStock:low,attendance:att},daily,top,sales});
});

app.get("/api/reports/sales",auth,(req,res)=>{
 const from=clean(req.query.from)||"2000-01-01",to=clean(req.query.to)||"2999-12-31";
 const summary=db.prepare("SELECT COUNT(*) orders,COALESCE(SUM(subtotal),0) subtotal,COALESCE(SUM(discount_amount),0) discount,COALESCE(SUM(total),0) total FROM orders WHERE order_date BETWEEN ? AND ? AND status!='DIBATALKAN'").get(from,to);
 const rows=db.prepare(`SELECT o.order_no,o.order_date,COALESCE(c.name,'-') customer,COALESCE(s.name,'-') sales,o.status,o.total FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN sales s ON s.id=o.sales_id WHERE o.order_date BETWEEN ? AND ? ORDER BY o.order_date DESC,o.id DESC`).all(from,to);
 const products=db.prepare(`SELECT p.name,p.category,ROUND(SUM(oi.qty),2) qty,ROUND(SUM(oi.subtotal),0) value FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN products p ON p.id=oi.product_id WHERE o.order_date BETWEEN ? AND ? AND o.status!='DIBATALKAN' GROUP BY p.id ORDER BY qty DESC`).all(from,to);
 res.json({summary,rows,products});
});

app.get("/api/users",roles("ADMIN"),(req,res)=>res.json(db.prepare("SELECT id,name,username,role,photo,active,created_at FROM users ORDER BY name").all()));
app.post("/api/users",roles("ADMIN"),(req,res)=>{try{const r=req.body;const info=db.prepare("INSERT INTO users(name,username,password_hash,role,photo,active) VALUES(?,?,?,?,?,1)").run(clean(r.name),clean(r.username),bcrypt.hashSync(String(r.password||"123456"),10),clean(r.role)||"OPERATOR",clean(r.photo));res.json({ok:true,id:info.lastInsertRowid})}catch(e){res.status(400).json({error:e.message})}});
app.put("/api/users/:id",roles("ADMIN"),(req,res)=>{try{const r=req.body;db.prepare("UPDATE users SET name=?,username=?,role=?,photo=?,active=? WHERE id=?").run(clean(r.name),clean(r.username),clean(r.role),clean(r.photo),r.active===false?0:1,num(req.params.id));if(r.password)db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(bcrypt.hashSync(String(r.password),10),num(req.params.id));res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}});
app.delete("/api/users/:id",roles("ADMIN"),(req,res)=>{db.prepare("DELETE FROM users WHERE id=?").run(num(req.params.id));res.json({ok:true})});
app.patch("/api/users/:id/password",auth,(req,res)=>{if(req.session.user.id!==num(req.params.id)&&req.session.user.role!=="ADMIN")return res.status(403).json({error:"Akses ditolak"});const p=String(req.body.password||"");if(p.length<6)return res.status(400).json({error:"Password minimal 6 karakter"});db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(bcrypt.hashSync(p,10),num(req.params.id));res.json({ok:true})});

app.get("/api/operators",auth,(req,res)=>res.json(db.prepare("SELECT id,name,username,role FROM users WHERE active=1 AND role IN ('OPERATOR','PACKAGING','ADMIN') ORDER BY name").all()));
function syncSalesAccounts(){
  const salesUsers=db.prepare("SELECT id,name FROM users WHERE role='SALES' AND active=1 ORDER BY name").all();
  const findByUser=db.prepare("SELECT id FROM sales WHERE user_id=?");
  const legacy=db.prepare("SELECT id FROM sales WHERE user_id IS NULL AND active=1 ORDER BY id LIMIT 1").get();
  const insert=db.prepare("INSERT INTO sales(user_id,name,phone,active) VALUES(?,?,?,1)");
  const update=db.prepare("UPDATE sales SET name=?,active=1 WHERE id=?");
  const link=db.prepare("UPDATE sales SET user_id=?,name=?,active=1 WHERE id=?");
  const tx=db.transaction(()=>{
    salesUsers.forEach((u,idx)=>{
      const existing=findByUser.get(u.id);
      if(existing){ update.run(u.name,existing.id); return; }
      if(idx===0 && legacy){ link.run(u.id,u.name,legacy.id); return; }
      insert.run(u.id,u.name,"");
    });
  });
  tx();
}
app.get("/api/sales",auth,(req,res)=>{
  try{
    syncSalesAccounts();
    const rows=db.prepare(`
      SELECT s.id,s.user_id,COALESCE(u.name,s.name) name,COALESCE(s.phone,'') phone
      FROM sales s
      LEFT JOIN users u ON u.id=s.user_id
      WHERE s.active=1 AND (s.user_id IS NULL OR (u.role='SALES' AND u.active=1))
      ORDER BY name
    `).all();
    res.json(rows);
  }catch(e){res.status(500).json({error:e.message||"Gagal mengambil daftar sales"})}
});
app.post("/api/sales",roles("ADMIN","SALES"),(req,res)=>{try{const i=db.prepare("INSERT INTO sales(name,phone) VALUES(?,?)").run(clean(req.body.name),clean(req.body.phone));res.json({ok:true,id:i.lastInsertRowid})}catch(e){res.status(400).json({error:e.message})}});
app.delete("/api/sales/:id",roles("ADMIN"),(req,res)=>{db.prepare("DELETE FROM sales WHERE id=?").run(num(req.params.id));res.json({ok:true})});

app.get("/api/customers",auth,(req,res)=>res.json(db.prepare("SELECT * FROM customers ORDER BY name").all()));
app.post("/api/customers",roles("ADMIN","SALES"),(req,res)=>{const r=req.body,i=db.prepare("INSERT INTO customers(name,phone,address,notes) VALUES(?,?,?,?)").run(clean(r.name),clean(r.phone),clean(r.address),clean(r.notes));res.json({ok:true,id:i.lastInsertRowid})});
app.put("/api/customers/:id",roles("ADMIN","SALES"),(req,res)=>{const r=req.body;db.prepare("UPDATE customers SET name=?,phone=?,address=?,notes=? WHERE id=?").run(clean(r.name),clean(r.phone),clean(r.address),clean(r.notes),num(req.params.id));res.json({ok:true})});
app.delete("/api/customers/:id",roles("ADMIN","SALES"),(req,res)=>{db.prepare("DELETE FROM customers WHERE id=?").run(num(req.params.id));res.json({ok:true})});

app.get("/api/products",auth,(req,res)=>res.json(db.prepare("SELECT * FROM products WHERE active=1 ORDER BY name").all()));
app.post("/api/products",roles("ADMIN","GUDANG"),(req,res)=>{try{const r=req.body,i=db.prepare("INSERT INTO products(name,category,size,unit,selling_price,stock,min_stock,notes) VALUES(?,?,?,?,?,?,?,?)").run(clean(r.name),clean(r.category),clean(r.size),clean(r.unit)||"pcs",num(r.selling_price),num(r.stock),num(r.min_stock),clean(r.notes));res.json({ok:true,id:i.lastInsertRowid})}catch(e){res.status(400).json({error:e.message})}});
app.put("/api/products/:id",roles("ADMIN","GUDANG"),(req,res)=>{const id=num(req.params.id),old=db.prepare("SELECT * FROM products WHERE id=?").get(id);if(!old)return res.status(404).json({error:"Produk tidak ditemukan"});const r=req.body;db.prepare("UPDATE products SET name=?,category=?,size=?,unit=?,selling_price=?,stock=?,min_stock=?,notes=?,active=? WHERE id=?").run(clean(r.name??old.name),clean(r.category??old.category),clean(r.size??old.size),clean(r.unit??old.unit)||old.unit,num(r.selling_price??old.selling_price),num(r.stock??old.stock),num(r.min_stock??old.min_stock),clean(r.notes??old.notes),r.active===false?0:1,id);res.json({ok:true})});
app.delete("/api/products/:id",roles("ADMIN","GUDANG"),(req,res)=>{try{const id=num(req.params.id);const p=db.prepare("SELECT id FROM products WHERE id=?").get(id);if(!p)return res.status(404).json({error:"Produk tidak ditemukan"});db.prepare("UPDATE products SET active=0 WHERE id=?").run(id);res.json({ok:true})}catch(e){res.status(400).json({error:e.message||"Gagal menghapus produk"})}});

app.get("/api/warehouse",auth,(req,res)=>res.json(db.prepare("SELECT * FROM products WHERE active=1 ORDER BY name").all()));
app.put("/api/warehouse/:id/stock",roles("ADMIN","GUDANG"),(req,res)=>{const id=num(req.params.id),newStock=num(req.body.stock);if(newStock<0)return res.status(400).json({error:"Stok tidak boleh negatif"});const p=db.prepare("SELECT stock FROM products WHERE id=?").get(id);if(!p)return res.status(404).json({error:"Produk tidak ditemukan"});const before=num(p.stock),diff=newStock-before;db.transaction(()=>{db.prepare("UPDATE products SET stock=? WHERE id=?").run(newStock,id);if(diff)db.prepare("INSERT INTO stock_movements(product_id,type,qty,before_stock,after_stock,note,user_id) VALUES(?,?,?,?,?,?,?)").run(id,"ADJUSTMENT",Math.abs(diff),before,newStock,clean(req.body.note)||"Edit stok gudang",req.session.user.id)})();res.json({ok:true,before,newStock,diff})});
app.get("/api/warehouse/movements",roles("ADMIN","GUDANG"),(req,res)=>res.json(db.prepare("SELECT sm.*,p.name product_name,u.name user_name FROM stock_movements sm JOIN products p ON p.id=sm.product_id LEFT JOIN users u ON u.id=sm.user_id ORDER BY sm.id DESC LIMIT 200").all()));

app.get("/api/raw-materials",auth,(req,res)=>res.json(db.prepare("SELECT *,stock*weight_per_unit total_weight FROM raw_materials ORDER BY name").all()));
app.post("/api/raw-materials",roles("ADMIN","GUDANG","PACKAGING","OPERATOR"),(req,res)=>{const r=req.body,i=db.prepare("INSERT INTO raw_materials(name,material_type,thickness,width,length,unit,stock,min_stock,weight_per_unit,purchase_price,supplier,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(clean(r.name),clean(r.material_type)||"OPP",num(r.thickness),num(r.width),num(r.length),clean(r.unit)||"ROLL",num(r.stock),num(r.min_stock),num(r.weight_per_unit),num(r.purchase_price),clean(r.supplier),clean(r.notes));res.json({ok:true,id:i.lastInsertRowid})});
app.put("/api/raw-materials/:id",roles("ADMIN","GUDANG","PACKAGING","OPERATOR"),(req,res)=>{const r=req.body;db.prepare("UPDATE raw_materials SET name=?,material_type=?,thickness=?,width=?,length=?,unit=?,min_stock=?,weight_per_unit=?,purchase_price=?,supplier=?,notes=? WHERE id=?").run(clean(r.name),clean(r.material_type),num(r.thickness),num(r.width),num(r.length),clean(r.unit),num(r.min_stock),num(r.weight_per_unit),num(r.purchase_price),clean(r.supplier),clean(r.notes),num(req.params.id));res.json({ok:true})});
app.delete("/api/raw-materials/:id",roles("ADMIN","GUDANG"),(req,res)=>{db.prepare("DELETE FROM raw_materials WHERE id=?").run(num(req.params.id));res.json({ok:true})});
app.put("/api/raw-materials/:id/stock",roles("ADMIN","GUDANG","PACKAGING","OPERATOR"),(req,res)=>{const id=num(req.params.id),ns=num(req.body.stock),p=db.prepare("SELECT stock FROM raw_materials WHERE id=?").get(id);if(!p||ns<0)return res.status(400).json({error:"Data stok tidak valid"});const b=num(p.stock),d=ns-b;db.transaction(()=>{db.prepare("UPDATE raw_materials SET stock=? WHERE id=?").run(ns,id);if(d)db.prepare("INSERT INTO raw_material_movements(raw_material_id,type,qty,before_stock,after_stock,note,user_id) VALUES(?,?,?,?,?,?,?)").run(id,"ADJUSTMENT",Math.abs(d),b,ns,clean(req.body.note)||"Edit stok bahan baku",req.session.user.id)})();res.json({ok:true})});

app.get("/api/bom",auth,(req,res)=>{const rows=db.prepare(`SELECT pm.*,p.name product_name,r.name material_name,r.unit,r.stock,r.weight_per_unit material_weight_per_unit,ROUND(pm.qty_per_unit*r.weight_per_unit,3) total_weight FROM product_materials pm JOIN products p ON p.id=pm.product_id JOIN raw_materials r ON r.id=pm.raw_material_id WHERE p.active=1 ORDER BY p.name,r.name`).all();const total=rows.reduce((a,x)=>a+num(x.total_weight),0);res.json({rows,total_weight:Math.round(total*1000)/1000})});
app.post("/api/bom",roles("ADMIN","GUDANG","OPERATOR","PACKAGING"),(req,res)=>{const r=req.body;db.prepare(`INSERT INTO product_materials(product_id,raw_material_id,qty_per_unit,weight_per_unit,notes) VALUES(?,?,?,?,?) ON CONFLICT(product_id,raw_material_id) DO UPDATE SET qty_per_unit=excluded.qty_per_unit,weight_per_unit=excluded.weight_per_unit,notes=excluded.notes`).run(num(r.product_id),num(r.raw_material_id),num(r.qty_per_unit),num(r.weight_per_unit),clean(r.notes));res.json({ok:true})});
app.delete("/api/bom/:id",roles("ADMIN","GUDANG","OPERATOR","PACKAGING"),(req,res)=>{db.prepare("DELETE FROM product_materials WHERE id=?").run(num(req.params.id));res.json({ok:true})});

app.get("/api/machines",auth,(req,res)=>res.json(db.prepare("SELECT * FROM machines ORDER BY id").all()));
app.post("/api/machines",roles("ADMIN","OPERATOR","PACKAGING"),(req,res)=>{try{const r=req.body,i=db.prepare("INSERT INTO machines(code,name,status,notes) VALUES(?,?,?,?)").run(clean(r.code)||`M-${Date.now()}`,clean(r.name),clean(r.status)||"MENUNGGU",clean(r.notes));res.json({ok:true,id:i.lastInsertRowid})}catch(e){res.status(400).json({error:e.message})}});
app.put("/api/machines/:id",roles("ADMIN","OPERATOR","PACKAGING"),(req,res)=>{const r=req.body;db.prepare("UPDATE machines SET code=?,name=?,status=?,notes=? WHERE id=?").run(clean(r.code),clean(r.name),clean(r.status),clean(r.notes),num(req.params.id));res.json({ok:true})});
app.delete("/api/machines/:id",roles("ADMIN"),(req,res)=>{db.prepare("DELETE FROM machines WHERE id=?").run(num(req.params.id));res.json({ok:true})});
app.get("/api/production-options",auth,(req,res)=>res.json({types:db.prepare("SELECT * FROM production_types WHERE active=1 ORDER BY name").all(),sizes:db.prepare("SELECT * FROM production_sizes WHERE active=1 ORDER BY name").all()}));
app.post("/api/production-options/type",roles("ADMIN","OPERATOR","PACKAGING"),(req,res)=>{const i=db.prepare("INSERT INTO production_types(name) VALUES(?)").run(clean(req.body.name));res.json({ok:true,id:i.lastInsertRowid})});
app.post("/api/production-options/size",roles("ADMIN","OPERATOR","PACKAGING"),(req,res)=>{const i=db.prepare("INSERT INTO production_sizes(name) VALUES(?)").run(clean(req.body.name));res.json({ok:true,id:i.lastInsertRowid})});
app.delete("/api/production-options/type/:id",roles("ADMIN"),(req,res)=>{db.prepare("DELETE FROM production_types WHERE id=?").run(num(req.params.id));res.json({ok:true})});
app.delete("/api/production-options/size/:id",roles("ADMIN"),(req,res)=>{db.prepare("DELETE FROM production_sizes WHERE id=?").run(num(req.params.id));res.json({ok:true})});

app.get("/api/production/jobs",auth,(req,res)=>{
 const rows=db.prepare(`SELECT j.*,p.name product_name,t.name type_name,s.name size_name,
 GROUP_CONCAT(DISTINCT u1.name) operator1_name,GROUP_CONCAT(DISTINCT u2.name) operator2_name,
 GROUP_CONCAT(DISTINCT m.name) machine_name
 FROM production_jobs j LEFT JOIN products p ON p.id=j.product_id LEFT JOIN production_types t ON t.id=j.type_id LEFT JOIN production_sizes s ON s.id=j.size_id
 LEFT JOIN production_job_assignments a ON a.production_job_id=j.id LEFT JOIN users u1 ON u1.id=a.operator1_id LEFT JOIN users u2 ON u2.id=a.operator2_id LEFT JOIN machines m ON m.id=a.machine_id
 GROUP BY j.id ORDER BY j.production_date DESC,j.id DESC`).all();
 res.json(rows);
});
app.post("/api/production/jobs",roles("ADMIN","OPERATOR","PACKAGING"),(req,res)=>{try{const r=req.body;if(!r.machine_id||!r.operator1_id)return res.status(400).json({error:"Mesin dan Operator 1 wajib dipilih"});const tx=db.transaction(()=>{const j=db.prepare("INSERT INTO production_jobs(production_date,product_id,type_id,size_id,target_qty,notes) VALUES(?,?,?,?,?,?)").run(clean(r.production_date)||today(),num(r.product_id)||null,num(r.type_id)||null,num(r.size_id)||null,num(r.target_qty),clean(r.notes));db.prepare("INSERT INTO production_job_assignments(production_job_id,machine_id,operator1_id,operator2_id,target_qty,status,started_at) VALUES(?,?,?,?,?,?,?)").run(j.lastInsertRowid,num(r.machine_id),num(r.operator1_id),num(r.operator2_id)||null,num(r.target_qty),"BERJALAN",now());db.prepare("UPDATE machines SET status='BERJALAN' WHERE id=?").run(num(r.machine_id));return j.lastInsertRowid});res.json({ok:true,id:tx()})}catch(e){res.status(400).json({error:e.message})}});
app.post("/api/production/jobs/:id/complete",roles("ADMIN","OPERATOR","PACKAGING"),(req,res)=>{const id=num(req.params.id),qty=num(req.body.completed_qty);if(qty<0)return res.status(400).json({error:"Hasil tidak valid"});const j=db.prepare("SELECT * FROM production_jobs WHERE id=?").get(id);if(!j)return res.status(404).json({error:"Produksi tidak ditemukan"});db.transaction(()=>{db.prepare("UPDATE production_jobs SET completed_qty=?,status='SELESAI',completed_at=? WHERE id=?").run(qty,now(),id);db.prepare("UPDATE production_job_assignments SET completed_qty=?,status='SELESAI',completed_at=? WHERE production_job_id=?").run(qty,now(),id);const m=db.prepare("SELECT machine_id FROM production_job_assignments WHERE production_job_id=?").get(id);if(m)db.prepare("UPDATE machines SET status='MENUNGGU' WHERE id=?").run(m.machine_id);if(j.product_id&&qty>0){const p=db.prepare("SELECT stock FROM products WHERE id=?").get(j.product_id);if(p){const b=num(p.stock),a=b+qty;db.prepare("UPDATE products SET stock=? WHERE id=?").run(a,j.product_id);db.prepare("INSERT INTO stock_movements(product_id,type,qty,before_stock,after_stock,note,user_id) VALUES(?,?,?,?,?,?,?)").run(j.product_id,"PRODUKSI",qty,b,a,"Hasil produksi selesai",req.session.user.id)}}})();res.json({ok:true})});
app.delete("/api/production/jobs/:id",roles("ADMIN","OPERATOR","PACKAGING"),(req,res)=>{try{const id=num(req.params.id);const j=db.prepare("SELECT id,status,product_id,completed_qty FROM production_jobs WHERE id=?").get(id);if(!j)return res.status(404).json({error:"Produksi tidak ditemukan"});db.transaction(()=>{const a=db.prepare("SELECT machine_id FROM production_job_assignments WHERE production_job_id=?").get(id);if(j.status==="SELESAI"&&j.product_id&&num(j.completed_qty)>0){const p=db.prepare("SELECT stock FROM products WHERE id=?").get(j.product_id);if(p){const before=num(p.stock),qty=num(j.completed_qty),after=before-qty;if(after<0)throw Error("Stok produk tidak cukup untuk membatalkan hasil produksi ini");db.prepare("UPDATE products SET stock=? WHERE id=?").run(after,j.product_id);db.prepare("INSERT INTO stock_movements(product_id,type,qty,before_stock,after_stock,note,user_id) VALUES(?,?,?,?,?,?,?)").run(j.product_id,"BATAL_PRODUKSI",qty,before,after,"Hapus data hasil produksi",req.session.user.id)}}db.prepare("DELETE FROM production_job_assignments WHERE production_job_id=?").run(id);db.prepare("DELETE FROM production_jobs WHERE id=?").run(id);if(a)db.prepare("UPDATE machines SET status='MENUNGGU' WHERE id=? AND status='BERJALAN'").run(a.machine_id)})();res.json({ok:true})}catch(e){res.status(400).json({error:e.message||"Gagal menghapus produksi"})}});
app.get("/api/production/recap",auth,(req,res)=>{const d=clean(req.query.date)||today();const byMachine=db.prepare(`SELECT m.name machine,COALESCE(SUM(a.target_qty),0) target,COALESCE(SUM(a.completed_qty),0) completed FROM production_job_assignments a JOIN production_jobs j ON j.id=a.production_job_id JOIN machines m ON m.id=a.machine_id WHERE j.production_date=? GROUP BY m.id ORDER BY m.id`).all(d);const daily=db.prepare("SELECT COUNT(*) jobs,COALESCE(SUM(target_qty),0) target,COALESCE(SUM(completed_qty),0) completed FROM production_jobs WHERE production_date=?").get(d);res.json({date:d,daily,byMachine})});

app.get("/api/orders",auth,(req,res)=>res.json(db.prepare(`SELECT o.*,COALESCE(c.name,'-') customer_name,COALESCE(s.name,'-') sales_name,(SELECT COUNT(*) FROM order_items x WHERE x.order_id=o.id) item_count FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN sales s ON s.id=o.sales_id ORDER BY o.id DESC`).all()));
app.get("/api/orders/:id",auth,(req,res)=>{const o=db.prepare("SELECT o.*,COALESCE(c.name,'-') customer_name,COALESCE(s.name,'-') sales_name FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN sales s ON s.id=o.sales_id WHERE o.id=?").get(num(req.params.id));if(!o)return res.status(404).json({error:"Order tidak ditemukan"});o.items=db.prepare("SELECT oi.*,p.name product_name,p.unit FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?").all(o.id);res.json(o)});
app.post("/api/orders",roles("ADMIN","SALES"),(req,res)=>{
  try{
    const r=req.body||{};
    const items=Array.isArray(r.items)?r.items:[];
    if(!items.length)return res.status(400).json({error:"Minimal satu produk harus dipilih"});
    const calc=items.map(x=>{
      const p=db.prepare("SELECT * FROM products WHERE id=? AND active=1").get(num(x.product_id));
      if(!p)throw Error("Produk tidak ditemukan");
      const q=num(x.qty);
      if(q<=0)throw Error(`Qty produk ${p.name} harus lebih dari 0`);
      if(num(p.stock)<q)throw Error(`Stok ${p.name} tidak mencukupi. Stok tersedia: ${p.stock}`);
      return {p,q,sub:q*num(x.unit_price??p.selling_price)};
    });
    const subtotal=calc.reduce((a,x)=>a+x.sub,0);
    const dv=Math.max(0,num(r.discount_value));
    const dtype=clean(r.discount_type)==="AMOUNT"?"AMOUNT":"PERCENT";
    const dam=dtype==="AMOUNT"?Math.min(dv,subtotal):Math.min(subtotal,subtotal*dv/100);
    const total=Math.max(0,subtotal-dam);
    const no=orderNo();
    const createOrder=db.transaction(()=>{
      const o=db.prepare("INSERT INTO orders(order_no,customer_id,sales_id,order_date,status,subtotal,discount_type,discount_value,discount_amount,total,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
        .run(no,num(r.customer_id)||null,num(r.sales_id)||null,clean(r.order_date)||today(),"DIPROSES",subtotal,dtype,dv,dam,total,clean(r.notes));
      const orderId=Number(o.lastInsertRowid);
      if(!orderId) throw Error("Order gagal mendapatkan ID database.");
      for(const x of calc){
        const b=num(x.p.stock),a=b-x.q;
        db.prepare("INSERT INTO order_items(order_id,product_id,qty,unit_price,subtotal) VALUES(?,?,?,?,?)").run(orderId,x.p.id,x.q,x.p.selling_price,x.sub);
        db.prepare("UPDATE products SET stock=? WHERE id=?").run(a,x.p.id);
        db.prepare("INSERT INTO stock_movements(product_id,type,qty,before_stock,after_stock,note,user_id) VALUES(?,?,?,?,?,?,?)").run(x.p.id,"ORDER",x.q,b,a,"Order "+no,req.session.user.id);
      }
      return orderId;
    });
    const orderId=createOrder();
    res.json({ok:true,id:orderId,order_id:orderId,order_no:no});
  }catch(e){
    console.error("POST /api/orders:",e);
    res.status(400).json({error:e.message||"Gagal menyimpan order"});
  }
});
app.patch("/api/orders/:id/status",roles("ADMIN","SALES"),(req,res)=>{const st=clean(req.body.status);if(!["DIPROSES","SELESAI","DIKIRIM","DIBATALKAN"].includes(st))return res.status(400).json({error:"Status tidak valid"});const o=db.prepare("SELECT * FROM orders WHERE id=?").get(num(req.params.id));if(!o)return res.status(404).json({error:"Order tidak ditemukan"});db.transaction(()=>{if(st==="DIBATALKAN"&&o.status!=="DIBATALKAN"){const its=db.prepare("SELECT * FROM order_items WHERE order_id=?").all(o.id);for(const x of its){const p=db.prepare("SELECT stock FROM products WHERE id=?").get(x.product_id);const b=num(p.stock),a=b+x.qty;db.prepare("UPDATE products SET stock=? WHERE id=?").run(a,x.product_id);db.prepare("INSERT INTO stock_movements(product_id,type,qty,before_stock,after_stock,note,user_id) VALUES(?,?,?,?,?,?,?)").run(x.product_id,"BATAL_ORDER",x.qty,b,a,"Pembatalan "+o.order_no,req.session.user.id)}}db.prepare("UPDATE orders SET status=? WHERE id=?").run(st,o.id)})();res.json({ok:true})});
app.delete("/api/orders/:id",roles("ADMIN","SALES"),(req,res)=>{const o=db.prepare("SELECT * FROM orders WHERE id=?").get(num(req.params.id));if(!o)return res.status(404).json({error:"Order tidak ditemukan"});if(o.status!=="DIBATALKAN")return res.status(400).json({error:"Batalkan order terlebih dahulu agar stok dikembalikan"});db.prepare("DELETE FROM orders WHERE id=?").run(o.id);res.json({ok:true})});

app.get("/api/deliveries",auth,(req,res)=>res.json(db.prepare(`SELECT d.*,o.order_no,COALESCE(u.name,'-') driver_name FROM deliveries d LEFT JOIN orders o ON o.id=d.order_id LEFT JOIN users u ON u.id=d.driver_id ORDER BY d.id DESC`).all()));
app.post("/api/deliveries",roles("ADMIN","DRIVER","SALES"),(req,res)=>{const r=req.body,i=db.prepare("INSERT INTO deliveries(order_id,driver_id,origin,destination,route,latitude,longitude,goods,status,notes) VALUES(?,?,?,?,?,?,?,?,?,?)").run(num(r.order_id)||null,num(r.driver_id)||null,clean(r.origin),clean(r.destination),clean(r.route),r.latitude===""?null:num(r.latitude),r.longitude===""?null:num(r.longitude),clean(r.goods),clean(r.status)||"DIPERSIAPKAN",clean(r.notes));res.json({ok:true,id:i.lastInsertRowid})});
app.patch("/api/deliveries/:id/status",roles("ADMIN","DRIVER","SALES"),(req,res)=>{db.prepare("UPDATE deliveries SET status=? WHERE id=?").run(clean(req.body.status),num(req.params.id));res.json({ok:true})});
app.delete("/api/deliveries/:id",roles("ADMIN","SALES","DRIVER"),(req,res)=>{db.prepare("DELETE FROM deliveries WHERE id=?").run(num(req.params.id));res.json({ok:true})});

function attendanceRows(userId,from,to){return db.prepare(`SELECT a.*,u.name,u.role FROM attendance a JOIN users u ON u.id=a.user_id WHERE a.user_id=? AND a.attendance_date BETWEEN ? AND ? ORDER BY a.attendance_date DESC`).all(userId,from,to)}
app.get("/api/attendance/today",auth,(req,res)=>{const d=today();res.json(db.prepare(`SELECT u.id,u.name,u.role,a.attendance_date,a.check_in,a.check_out,a.status,a.late_minutes,a.work_minutes FROM users u LEFT JOIN attendance a ON a.user_id=u.id AND a.attendance_date=? WHERE u.active=1 ORDER BY u.name`).all(d))});
app.get("/api/attendance/user/:id",auth,(req,res)=>{const id=num(req.params.id);if(req.session.user.role!=="ADMIN"&&req.session.user.id!==id)return res.status(403).json({error:"Akses ditolak"});const base=new Date();const day=(base.getDay()+6)%7;const monday=new Date(base);monday.setDate(base.getDate()-day);const sunday=new Date(monday);sunday.setDate(monday.getDate()+6);const iso=d=>d.toISOString().slice(0,10);const from=clean(req.query.from)||iso(monday),to=clean(req.query.to)||iso(sunday);res.json({from,to,rows:attendanceRows(id,from,to)});});
app.post("/api/attendance/check-in",auth,(req,res)=>{const d=today(),u=req.session.user.id;if(db.prepare("SELECT id FROM attendance WHERE user_id=? AND attendance_date=?").get(u,d))return res.status(400).json({error:"Sudah memiliki data absensi hari ini"});const s=db.prepare("SELECT * FROM attendance_settings WHERE id=1").get(),t=new Date(),actual=t.getHours()*60+t.getMinutes(),[hh,mm]=s.work_start.split(":").map(Number),start=hh*60+mm,late=Math.max(0,actual-start-s.late_tolerance_minutes);db.prepare("INSERT INTO attendance(user_id,attendance_date,check_in,status,late_minutes) VALUES(?,?,?,?,?)").run(u,d,now(),late>0?"TERLAMBAT":"HADIR",late);res.json({ok:true})});
app.post("/api/attendance/check-out",auth,(req,res)=>{const d=today(),u=req.session.user.id,a=db.prepare("SELECT * FROM attendance WHERE user_id=? AND attendance_date=?").get(u,d);if(!a)return res.status(400).json({error:"Belum check-in"});const out=new Date(),work=Math.max(0,Math.round((out-new Date(a.check_in))/60000));db.prepare("UPDATE attendance SET check_out=?,work_minutes=? WHERE id=?").run(now(),work,a.id);res.json({ok:true})});
app.get("/api/attendance/summary",roles("ADMIN"),(req,res)=>{const d=clean(req.query.date)||today();res.json(db.prepare(`SELECT u.id,u.name,u.role,COALESCE(a.status,'ALPA') status,a.check_in,a.check_out,a.late_minutes,a.work_minutes FROM users u LEFT JOIN attendance a ON a.user_id=u.id AND a.attendance_date=? WHERE u.active=1 ORDER BY u.name`).all(d))});
app.post("/api/attendance/requests",auth,(req,res)=>{const r=req.body;db.prepare("INSERT INTO attendance_requests(user_id,attendance_date,request_type,note) VALUES(?,?,?,?)").run(req.session.user.id,clean(r.attendance_date)||today(),clean(r.request_type),clean(r.note));res.json({ok:true})});
app.get("/api/attendance/requests",roles("ADMIN"),(req,res)=>res.json(db.prepare(`SELECT ar.*,u.name FROM attendance_requests ar JOIN users u ON u.id=ar.user_id ORDER BY ar.id DESC`).all()));
app.patch("/api/attendance/requests/:id",roles("ADMIN"),(req,res)=>{db.prepare("UPDATE attendance_requests SET status=? WHERE id=?").run(clean(req.body.status),num(req.params.id));res.json({ok:true})});

app.get("/api/options/drivers",auth,(req,res)=>res.json(db.prepare("SELECT id,name FROM users WHERE active=1 AND role='DRIVER' ORDER BY name").all()));

app.use((req,res,next)=>{ if (req.method === "GET" && !req.path.startsWith("/api/")) return res.sendFile(path.join(__dirname,"public","index.html")); next(); });
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:err.message||"Server error"})});

app.listen(PORT,()=>console.log(`BSP Management System BARU berjalan di http://localhost:${PORT}`));
