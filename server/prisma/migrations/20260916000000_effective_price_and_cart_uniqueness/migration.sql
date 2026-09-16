-- Sorting and filtering by price must use the price the customer actually pays.
--
-- Ordering by the list price puts a ₹7,499 product ahead of a ₹6,999 one whenever the
-- cheaper card is showing a discount, and `maxPrice=1000` hides a ₹2,000 product that is
-- on sale for ₹900. The comparison the storefront needs is an expression, and Prisma can
-- only order and filter on columns — so the expression becomes a column.
--
-- A trigger rather than GENERATED ALWAYS: Prisma sends every column it knows about on an
-- insert, and Postgres rejects any write to a generated column. The trigger overwrites
-- whatever was sent, so the value still cannot drift from price/discountPrice no matter
-- which code path, migration or psql session writes them.
ALTER TABLE "products" ADD COLUMN "effectivePrice" DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION "products_set_effective_price"() RETURNS trigger AS $$
BEGIN
  NEW."effectivePrice" := CASE
    WHEN NEW."discountPrice" IS NOT NULL
     AND NEW."discountPrice" > 0
     AND NEW."discountPrice" < NEW."price"
      THEN NEW."discountPrice"
    ELSE NEW."price"
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "products_effective_price"
  BEFORE INSERT OR UPDATE ON "products"
  FOR EACH ROW EXECUTE FUNCTION "products_set_effective_price"();

-- Backfill the rows that existed before the trigger.
UPDATE "products"
SET "effectivePrice" = CASE
  WHEN "discountPrice" IS NOT NULL AND "discountPrice" > 0 AND "discountPrice" < "price"
    THEN "discountPrice"
  ELSE "price"
END;

-- CreateIndex
CREATE INDEX "products_effectivePrice_idx" ON "products"("effectivePrice");

-- Cart lines for a product with no variant were never actually unique.
--
-- `cart_items_cartId_productId_variantId_key` cannot deduplicate them: Postgres treats
-- every NULL as distinct in a unique index, so two rows with the same cart, the same
-- product and a NULL variant satisfy the constraint. Two concurrent add-to-cart requests
-- therefore both insert, and the cart ends up with the same item on two lines.
--
-- Fold any existing duplicates into the oldest row first, or the index cannot be built.
WITH ranked AS (
  SELECT
    "id",
    "cartId",
    "productId",
    SUM("quantity") OVER (PARTITION BY "cartId", "productId") AS "mergedQuantity",
    ROW_NUMBER() OVER (PARTITION BY "cartId", "productId" ORDER BY "createdAt", "id") AS "position"
  FROM "cart_items"
  WHERE "variantId" IS NULL
)
UPDATE "cart_items" AS c
SET "quantity" = LEAST(ranked."mergedQuantity", 10)
FROM ranked
WHERE c."id" = ranked."id" AND ranked."position" = 1;

DELETE FROM "cart_items" AS c
USING (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "cartId", "productId" ORDER BY "createdAt", "id") AS "position"
  FROM "cart_items"
  WHERE "variantId" IS NULL
) AS ranked
WHERE c."id" = ranked."id" AND ranked."position" > 1;

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_cartId_productId_no_variant_key"
  ON "cart_items"("cartId", "productId")
  WHERE "variantId" IS NULL;
