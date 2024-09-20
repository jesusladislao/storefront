import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { z } from 'zod';
import { loadCartFromCookies } from '~/features/cart/cart.server.ts';
import type { stripeProductMetadataSchema } from '~/lib/products.ts';
import { STRIPE_SECRET_KEY } from 'astro:env/server';

export const POST: APIRoute = async (context) => {
	const cart = await loadCartFromCookies(context.cookies);
	const stripe = new Stripe(STRIPE_SECRET_KEY);

	const session = await stripe.checkout.sessions.create({
		mode: 'payment',
		line_items: cart.items.map<Stripe.Checkout.SessionCreateParams.LineItem>((item) => {
			const metadata: z.input<typeof stripeProductMetadataSchema> = {
				productId: item.product.id,
				variationSelectionsJson: JSON.stringify(
					item.variationSelections.map((selection) => ({
						variationId: selection.variation.id,
						optionId: selection.option.id,
					})),
				),
			};
			return {
				price_data: {
					currency: 'usd',
					product_data: {
						name: item.product.name,
						images: [new URL(item.product.imageUrl, context.url).href],
						metadata,
					},
					unit_amount: item.product.price - item.product.discount,
				},
				quantity: item.quantity,
			};
		}),
		success_url: new URL('/api/checkout/success?session_id={CHECKOUT_SESSION_ID}', context.url)
			.href,
		cancel_url: new URL('/', context.url).href,
		shipping_address_collection: {
			allowed_countries: ['US'],
		},
	});

	if (!session.url) {
		throw new Error('Failed to create Stripe checkout session', {
			cause: session,
		});
	}

	return context.redirect(session.url, 303);
};
