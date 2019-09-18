import { ShopPaymentMethod } from "./shop_payment_method";

export class BraintreeApplePayShopPaymentMethod extends ShopPaymentMethod {
  beforeSetup() {
    if (!window.ApplePaySession || !ApplePaySession.supportsVersion(3) || !ApplePaySession.canMakePayments()) {
      const $applePayPaymentMethod = $('[data-select-payment-method="shop_payment_method_21"]');
      console.error("This device does not support Apple Pay");
      $applePayPaymentMethod.hide();
      return;
    }
  }

  setup(success, failure) {
    const that = this;

    // Start by generating a Braintree client token.
    submarine.api
      .generatePaymentProcessorClientToken("braintree", client_token => {
        // Then, create a Braintree client instance.
        braintree.client
          .create({
            authorization: client_token.attributes.token
          })
          .then(clientInstance => {
            // Next, set up the Apple Pay instance.
            return braintree.applePay.create({ client: clientInstance });
          })
          .then(applePayInstance => {
            // Finally, store a reference to the Apple Pay instance for later use.

            return ApplePaySession.canMakePaymentsWithActiveCard(applePayInstance.merchantIdentifier).then(function(
              canMakePaymentsWithActiveCard
            ) {
              if (canMakePaymentsWithActiveCard) {
                that.applePayInstance = applePayInstance;

                success();
              } else {
                const error = "No active card was found.";
                failure(error);
              }
            });
          })
          .catch(error => {
            failure(error);
          });
      })
      .catch(error => {
        failure(error);
      });
  }

  process(success, error, additionalData) {
    let that = this;
    let paymentRequest = that.applePayInstance.createPaymentRequest({
      total: {
        label: that.options.shop.name,
        amount: that.options.checkout.total_price
      }
    });
    let session = new ApplePaySession(3, paymentRequest);

    session.onvalidatemerchant = event => {
      that.applePayInstance
        .performValidation({
          validationURL: event.validationURL,
          displayName: that.options.shop.name
        })
        .then(merchantSession => session.completeMerchantValidation(merchantSession))
        .catch(validationError => {
          // You should show an error to the user, e.g. 'Apple Pay failed to load.'
          console.error("Error validating merchant:", validationError);
          session.abort();
        });

      session.onpaymentauthorized = event => {
        that.applePayInstance
          .tokenize({
            token: event.payment.token
          })
          .then(function(tokenizeError, payload) {
            if (!tokenizeError) {
              success({
                customer_payment_method_id: null,
                payment_nonce: payload.nonce,
                payment_method_type: "apple-pay",
                payment_processor: "braintree"
              });
              session.completePayment(ApplePaySession.STATUS_SUCCESS);
            } else {
              error({
                message: tokenizeError
              });
            }
          })
          .catch(function(tokenizeError) {
            error({
              message: tokenizeError
            });
            console.error("Error tokenizing Apple Pay:", tokenizeError);
            session.completePayment(ApplePaySession.STATUS_FAILURE);
          });
      };
    };

    session.begin();
  }

  getRenderTemplate() {
    return "shop_payment_method_apple_pay";
  }

  getRenderContext() {
    return {
      id: this.data.id,
      title: this.t("payment_methods.shop_payment_methods.braintree.apple_pay.title"),
      value: this.getValue(),
      icon: "generic",
      icon_description: this.t("payment_methods.shop_payment_methods.braintree.apple_pay.icon_description")
    };
  }
}
