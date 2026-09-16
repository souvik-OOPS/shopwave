/* eslint-disable no-console */
// The Prisma CLI loads .env for `migrate`/`studio`, but this script runs under tsx,
// which does not — so DATABASE_URL must be loaded explicitly before the client is built.
import 'dotenv/config';

import { PrismaClient, Prisma, type Category } from '@prisma/client';
import bcrypt from 'bcryptjs';

/**
 * Development seed. Idempotent where it can be: users, categories and brands are
 * upserted by their natural key, so re-running does not create duplicates.
 *
 *   npm run prisma:seed
 */
const prisma = new PrismaClient();

const PASSWORD_ROUNDS = 12;

async function seedUsers() {
  const [adminHash, staffHash, customerHash] = await Promise.all([
    bcrypt.hash('Admin@1234', PASSWORD_ROUNDS),
    bcrypt.hash('Staff@1234', PASSWORD_ROUNDS),
    bcrypt.hash('Customer@1234', PASSWORD_ROUNDS),
  ]);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@shopwave.test' },
    update: {},
    create: {
      email: 'admin@shopwave.test',
      passwordHash: adminHash,
      firstName: 'Aarav',
      lastName: 'Sharma',
      role: 'ADMIN',
      emailVerified: true,
      emailVerifiedAt: new Date(),
      phone: '9876543210',
    },
  });

  const staff = await prisma.user.upsert({
    where: { email: 'staff@shopwave.test' },
    update: {},
    create: {
      email: 'staff@shopwave.test',
      passwordHash: staffHash,
      firstName: 'Priya',
      lastName: 'Nair',
      role: 'STAFF',
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  const customer = await prisma.user.upsert({
    where: { email: 'customer@shopwave.test' },
    update: {},
    create: {
      email: 'customer@shopwave.test',
      passwordHash: customerHash,
      firstName: 'Rohan',
      lastName: 'Verma',
      role: 'CUSTOMER',
      emailVerified: true,
      emailVerifiedAt: new Date(),
      phone: '9812345678',
      cart: { create: {} },
      wishlist: { create: {} },
      addresses: {
        create: {
          fullName: 'Rohan Verma',
          phone: '9812345678',
          line1: '42, Koramangala 5th Block',
          line2: 'Near Forum Mall',
          city: 'Bengaluru',
          state: 'Karnataka',
          postalCode: '560095',
          country: 'India',
          isDefault: true,
        },
      },
    },
  });

  // Ensure cart/wishlist exist even when the user row already did.
  await prisma.cart.upsert({ where: { userId: customer.id }, update: {}, create: { userId: customer.id } });
  await prisma.wishlist.upsert({
    where: { userId: customer.id },
    update: {},
    create: { userId: customer.id },
  });

  console.log('✓ Users seeded (admin / staff / customer)');
  return { admin, staff, customer };
}

async function seedCategories(): Promise<Record<string, Category>> {
  const definitions: Array<{ name: string; slug: string; description: string; children?: string[] }> = [
    {
      name: 'Electronics',
      slug: 'electronics',
      description: 'Audio, wearables and everyday tech',
      children: ['Headphones', 'Smart Watches', 'Speakers'],
    },
    {
      name: 'Fashion',
      slug: 'fashion',
      description: 'Apparel and accessories',
      children: ['Footwear', 'Bags'],
    },
    { name: 'Home & Living', slug: 'home-living', description: 'Furnishing and kitchen essentials' },
  ];

  const created: Record<string, Category> = {};

  for (const [index, definition] of definitions.entries()) {
    const parent = await prisma.category.upsert({
      where: { slug: definition.slug },
      update: {},
      create: {
        name: definition.name,
        slug: definition.slug,
        description: definition.description,
        sortOrder: index,
        isActive: true,
      },
    });
    created[definition.slug] = parent;

    for (const [childIndex, childName] of (definition.children ?? []).entries()) {
      const childSlug = childName.toLowerCase().replace(/\s+/g, '-');
      created[childSlug] = await prisma.category.upsert({
        where: { slug: childSlug },
        update: {},
        create: {
          name: childName,
          slug: childSlug,
          parentId: parent.id,
          sortOrder: childIndex,
          isActive: true,
        },
      });
    }
  }

  console.log(`✓ Categories seeded (${Object.keys(created).length})`);
  return created;
}

async function seedBrands() {
  const names = ['Auralis', 'Northpeak', 'Kaya Living', 'Vertex', 'Lumen'];
  const brands: Record<string, { id: string }> = {};

  for (const name of names) {
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    brands[slug] = await prisma.brand.upsert({
      where: { slug },
      update: {},
      create: { name, slug, description: `${name} — considered design, built to last.`, isActive: true },
    });
  }

  console.log(`✓ Brands seeded (${names.length})`);
  return brands;
}

interface ProductSeed {
  name: string;
  categorySlug: string;
  brandSlug: string;
  price: number;
  discountPrice?: number;
  stock: number;
  description: string;
  shortDescription: string;
  tags: string[];
  isFeatured?: boolean;
  attributes: Array<{ name: string; value: string }>;
  variants?: Array<{ name: string; attributes: Record<string, string>; stock: number; priceDelta?: number }>;
}

const PRODUCTS: ProductSeed[] = [
  {
    name: 'Auralis Studio One Wireless Headphones',
    categorySlug: 'headphones',
    brandSlug: 'auralis',
    price: 24999,
    discountPrice: 18999,
    stock: 40,
    shortDescription: 'Reference-grade ANC headphones with 40-hour battery life.',
    description:
      'The Studio One pairs a custom 40mm beryllium-coated driver with adaptive noise cancellation that samples your environment 50,000 times a second. Memory-foam earcups wrapped in protein leather keep long sessions comfortable, and USB-C fast charging returns five hours of playback in ten minutes.',
    tags: ['wireless', 'anc', 'over-ear', 'premium'],
    isFeatured: true,
    attributes: [
      { name: 'Driver', value: '40mm beryllium-coated' },
      { name: 'Battery life', value: '40 hours (ANC on)' },
      { name: 'Connectivity', value: 'Bluetooth 5.3, USB-C, 3.5mm' },
      { name: 'Weight', value: '268 g' },
    ],
    variants: [
      { name: 'Midnight Black', attributes: { Colour: 'Midnight Black' }, stock: 20 },
      { name: 'Ivory', attributes: { Colour: 'Ivory' }, stock: 12 },
      { name: 'Forest Green', attributes: { Colour: 'Forest Green' }, stock: 8 },
    ],
  },
  {
    name: 'Auralis Drift Pro Earbuds',
    categorySlug: 'headphones',
    brandSlug: 'auralis',
    price: 12999,
    discountPrice: 9499,
    stock: 65,
    shortDescription: 'Compact ANC earbuds with wireless charging and IPX5 sweat resistance.',
    description:
      'Drift Pro fits six hours of playback into a 4.2 gram shell, with a further 24 hours in the wireless charging case. Dual beamforming microphones isolate your voice on calls, and the low-latency gaming mode drops end-to-end delay under 60ms.',
    tags: ['earbuds', 'anc', 'wireless', 'ipx5'],
    isFeatured: true,
    attributes: [
      { name: 'Battery life', value: '6h + 24h case' },
      { name: 'Water resistance', value: 'IPX5' },
      { name: 'Charging', value: 'USB-C + Qi wireless' },
    ],
  },
  {
    name: 'Vertex Pulse 3 Smartwatch',
    categorySlug: 'smart-watches',
    brandSlug: 'vertex',
    price: 18999,
    stock: 32,
    shortDescription: 'AMOLED fitness watch with 14-day battery and dual-band GPS.',
    description:
      'A 1.43" AMOLED panel at 466x466 sits under sapphire glass. Dual-band GPS locks on in dense city blocks where single-band watches drift, and the optical sensor tracks heart rate, SpO2 and sleep stages continuously without collapsing the two-week battery estimate.',
    tags: ['smartwatch', 'fitness', 'gps', 'amoled'],
    isFeatured: true,
    attributes: [
      { name: 'Display', value: '1.43" AMOLED, 466x466' },
      { name: 'Battery', value: 'Up to 14 days' },
      { name: 'Water rating', value: '5 ATM' },
    ],
    variants: [
      { name: '42mm Graphite', attributes: { Size: '42mm', Colour: 'Graphite' }, stock: 18 },
      { name: '46mm Silver', attributes: { Size: '46mm', Colour: 'Silver' }, stock: 14, priceDelta: 2000 },
    ],
  },
  {
    name: 'Lumen Arc Portable Speaker',
    categorySlug: 'speakers',
    brandSlug: 'lumen',
    price: 8999,
    discountPrice: 6999,
    stock: 50,
    shortDescription: 'IP67 speaker with 20-hour playback and stereo pairing.',
    description:
      'Two 45mm full-range drivers and a passive radiator give the Arc genuine low end for its size. The IP67 housing survives a metre of water for half an hour, and any two units pair into a true stereo image.',
    tags: ['speaker', 'bluetooth', 'ip67', 'portable'],
    attributes: [
      { name: 'Output', value: '30W RMS' },
      { name: 'Battery', value: '20 hours' },
      { name: 'Rating', value: 'IP67' },
    ],
  },
  {
    name: 'Northpeak Trail Runner GTX',
    categorySlug: 'footwear',
    brandSlug: 'northpeak',
    price: 11999,
    discountPrice: 8999,
    stock: 45,
    shortDescription: 'Waterproof trail shoe with a 4mm lugged Vibram outsole.',
    description:
      'A GORE-TEX bootie keeps water out while staying breathable on long climbs. The nitrogen-infused midsole returns energy without feeling unstable on off-camber ground, and a rock plate protects underfoot on scree.',
    tags: ['running', 'trail', 'waterproof', 'gore-tex'],
    isFeatured: true,
    attributes: [
      { name: 'Drop', value: '8mm' },
      { name: 'Outsole', value: 'Vibram Megagrip, 4mm lugs' },
      { name: 'Weight', value: '295 g (UK 8)' },
    ],
    variants: [
      { name: 'UK 7', attributes: { Size: 'UK 7' }, stock: 10 },
      { name: 'UK 8', attributes: { Size: 'UK 8' }, stock: 15 },
      { name: 'UK 9', attributes: { Size: 'UK 9' }, stock: 12 },
      { name: 'UK 10', attributes: { Size: 'UK 10' }, stock: 8 },
    ],
  },
  {
    name: 'Northpeak Transit 28L Backpack',
    categorySlug: 'bags',
    brandSlug: 'northpeak',
    price: 7499,
    stock: 60,
    shortDescription: 'Carry-on backpack with a suspended 16" laptop sleeve.',
    description:
      'Built from recycled 420D ripstop with a DWR finish. The laptop sleeve is suspended 25mm off the base so a dropped bag does not transmit shock to the machine, and the clamshell opening lets the whole pack lie flat at security.',
    tags: ['backpack', 'travel', 'laptop', 'recycled'],
    attributes: [
      { name: 'Capacity', value: '28 litres' },
      { name: 'Fabric', value: 'Recycled 420D ripstop' },
      { name: 'Laptop', value: 'Fits up to 16"' },
    ],
  },
  {
    name: 'Kaya Living Ceramic Pour-Over Set',
    categorySlug: 'home-living',
    brandSlug: 'kaya-living',
    price: 3499,
    discountPrice: 2799,
    stock: 8,
    shortDescription: 'Stoneware dripper and 600ml server, glazed by hand.',
    description:
      'Thrown from high-fired stoneware that holds brewing temperature more steadily than glass. The spiral ribs and single 20mm aperture give a consistent, unhurried drawdown; the server is graduated for two cups.',
    tags: ['coffee', 'ceramic', 'kitchen', 'handmade'],
    attributes: [
      { name: 'Material', value: 'High-fired stoneware' },
      { name: 'Server capacity', value: '600 ml' },
      { name: 'Dishwasher safe', value: 'Yes' },
    ],
  },
  {
    name: 'Kaya Living Linen Bedding Set',
    categorySlug: 'home-living',
    brandSlug: 'kaya-living',
    price: 12999,
    stock: 3,
    shortDescription: 'Stonewashed European flax linen, softer with every wash.',
    description:
      'Woven from certified European flax and stonewashed for immediate softness. Linen moves roughly 20% more moisture than cotton, which is why it sleeps cooler in summer and still insulates in winter. Includes duvet cover and two pillowcases.',
    tags: ['bedding', 'linen', 'bedroom'],
    attributes: [
      { name: 'Material', value: '100% European flax linen' },
      { name: 'GSM', value: '165' },
      { name: 'Includes', value: 'Duvet cover + 2 pillowcases' },
    ],
    variants: [
      { name: 'Queen — Oatmeal', attributes: { Size: 'Queen', Colour: 'Oatmeal' }, stock: 2 },
      { name: 'King — Slate', attributes: { Size: 'King', Colour: 'Slate' }, stock: 1, priceDelta: 2000 },
    ],
  },
];

/** Deterministic placeholder imagery, so seeded products render without Cloudinary. */
function imageFor(seed: string, index: number): string {
  return `https://picsum.photos/seed/${encodeURIComponent(`${seed}-${index}`)}/900/900`;
}

async function seedProducts(
  categories: Record<string, Category>,
  brands: Record<string, { id: string }>,
) {
  let created = 0;

  for (const [index, definition] of PRODUCTS.entries()) {
    const slug = definition.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const exists = await prisma.product.findUnique({ where: { slug } });
    if (exists) continue;

    const category = categories[definition.categorySlug];
    const brand = brands[definition.brandSlug];
    if (!category || !brand) continue;

    // Sequenced by position rather than derived from the slug: two products from the
    // same brand ("Auralis Studio One…", "Auralis Drift Pro…") share a slug prefix and
    // would otherwise collide on the unique SKU constraint.
    const sku = `${definition.brandSlug.slice(0, 3).toUpperCase()}-${String(index + 1).padStart(3, '0')}`;

    const product = await prisma.product.create({
      data: {
        name: definition.name,
        slug,
        sku,
        description: definition.description,
        shortDescription: definition.shortDescription,
        price: new Prisma.Decimal(definition.price),
        ...(definition.discountPrice
          ? { discountPrice: new Prisma.Decimal(definition.discountPrice) }
          : {}),
        categoryId: category.id,
        brandId: brand.id,
        status: 'ACTIVE',
        isFeatured: definition.isFeatured ?? false,
        publishedAt: new Date(),
        tags: definition.tags,
        metaTitle: definition.name,
        metaDescription: definition.shortDescription,
        images: {
          createMany: {
            data: [0, 1, 2].map((index) => ({
              url: imageFor(slug, index),
              alt: `${definition.name} — view ${index + 1}`,
              position: index,
              isPrimary: index === 0,
            })),
          },
        },
        attributes: {
          createMany: {
            data: definition.attributes.map((attribute, index) => ({ ...attribute, position: index })),
          },
        },
      },
    });

    // Every product gets an inventory row; variants get their own on top.
    await prisma.inventory.create({
      data: { productId: product.id, quantity: definition.stock, lowStockThreshold: 5 },
    });

    for (const [index, variant] of (definition.variants ?? []).entries()) {
      const createdVariant = await prisma.productVariant.create({
        data: {
          productId: product.id,
          name: variant.name,
          sku: `${sku}-V${index + 1}`,
          attributes: variant.attributes,
          position: index,
          ...(variant.priceDelta
            ? { price: new Prisma.Decimal(definition.price + variant.priceDelta) }
            : {}),
        },
      });

      await prisma.inventory.create({
        data: { variantId: createdVariant.id, quantity: variant.stock, lowStockThreshold: 3 },
      });
    }

    created += 1;
  }

  console.log(`✓ Products seeded (${created} new, ${PRODUCTS.length - created} already present)`);
}

async function seedCoupons() {
  const coupons = [
    {
      code: 'WELCOME10',
      description: '10% off your first order',
      type: 'PERCENTAGE' as const,
      value: new Prisma.Decimal(10),
      minOrderAmount: new Prisma.Decimal(999),
      maxDiscountAmount: new Prisma.Decimal(2000),
      perUserLimit: 1,
      usageLimit: 1000,
    },
    {
      code: 'FLAT500',
      description: '₹500 off orders over ₹4,999',
      type: 'FIXED' as const,
      value: new Prisma.Decimal(500),
      minOrderAmount: new Prisma.Decimal(4999),
      perUserLimit: 3,
    },
    {
      code: 'EXPIRED20',
      description: 'Lapsed campaign — useful for testing the expiry path',
      type: 'PERCENTAGE' as const,
      value: new Prisma.Decimal(20),
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    },
  ];

  for (const coupon of coupons) {
    await prisma.coupon.upsert({ where: { code: coupon.code }, update: {}, create: coupon });
  }

  console.log(`✓ Coupons seeded (${coupons.length})`);
}

async function main() {
  console.log('\nSeeding ShopWave…\n');

  await seedUsers();
  const categories = await seedCategories();
  const brands = await seedBrands();
  await seedProducts(categories, brands);
  await seedCoupons();

  console.log(`
Done. Sign in with:

  Admin     admin@shopwave.test     Admin@1234
  Staff     staff@shopwave.test     Staff@1234
  Customer  customer@shopwave.test  Customer@1234
`);
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
