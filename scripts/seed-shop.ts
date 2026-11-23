// Seeds the read-only `shop` collection that firestore.rules reads to check purchases and
// unlocks:
//   shop/{id}     = { price, rarity, type }              (purchasable items of src/cosmetics/catalog.ts)
//   shop/{id}     = { achievement: true, rarity, type }  (items only an achievement gives)
//   shop/_config  = { discountOrder }                    (= DISCOUNT_ORDER)
// Run it again whenever a price, DISCOUNT_ORDER or the achievement items change.
//
// Needs a service account key (Firebase Console → Project settings → Service accounts →
// Generate new private key), pointed to by GOOGLE_APPLICATION_CREDENTIALS. Never commit it.
//   PowerShell:  $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\keys\lasertype-service-account.json"; npm run seed:shop
//   bash:        GOOGLE_APPLICATION_CREDENTIALS=~/keys/lasertype-service-account.json npm run seed:shop
//   Preview without writing:  npm run seed:shop -- --dry-run
// Runs on Node ≥ 22.18 / 23.6 (native TypeScript), no build step.
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { SHOP, SHOP_CONFIG_ID, shopDocuments } from '../src/firebase/shopDocs.ts';

function fail(message: string): never {
  console.error(`seed-shop: ${message}`);
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
const docs = shopDocuments();
const entries = Object.entries(docs.items);
const achievements = Object.entries(docs.achievements);

console.log(`${entries.length} itens compráveis:`);
for (const [id, doc] of entries) console.log(`  ${SHOP}/${id}  ${doc.type} · ${doc.rarity} · ${doc.price}`);
console.log(`${achievements.length} itens de conquista (sem preço):`);
for (const [id, doc] of achievements) console.log(`  ${SHOP}/${id}  ${doc.type} · ${doc.rarity} · achievement: true`);
console.log(`  ${SHOP}/${SHOP_CONFIG_ID}  discountOrder (${docs.config.discountOrder.length}): ${docs.config.discountOrder.join(', ')}`);

if (dryRun) {
  console.log('--dry-run: nada foi gravado.');
  process.exit(0);
}

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
if (!keyPath) fail('defina GOOGLE_APPLICATION_CREDENTIALS com o caminho da chave da conta de serviço (.json).');
if (!existsSync(keyPath)) fail(`arquivo não encontrado: ${keyPath}`);

let projectId: string;
try {
  const key = JSON.parse(readFileSync(keyPath, 'utf8')) as { project_id?: unknown };
  if (typeof key.project_id !== 'string') throw new Error('no project_id');
  projectId = key.project_id;
} catch {
  fail(`${keyPath} não é uma chave de conta de serviço válida.`);
}

initializeApp({ credential: cert(keyPath), projectId });
const db = getFirestore();
const shop = db.collection(SHOP);

const batch = db.batch();
for (const [id, doc] of [...entries, ...achievements]) batch.set(shop.doc(id), { ...doc });
batch.set(shop.doc(SHOP_CONFIG_ID), { discountOrder: [...docs.config.discountOrder] });
await batch.commit();
const total = entries.length + achievements.length;
console.log(`OK: ${total} itens + ${SHOP}/${SHOP_CONFIG_ID} gravados no projeto ${projectId}.`);

// Items that left the catalog keep their old document: list them (delete by hand in the console).
const stale = (await shop.listDocuments()).map((ref) => ref.id).filter((id) => id !== SHOP_CONFIG_ID && !(id in docs.items) && !(id in docs.achievements));
if (stale.length > 0) console.warn(`Aviso: documentos fora do catálogo em ${SHOP}/: ${stale.join(', ')}`);
