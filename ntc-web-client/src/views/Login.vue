<template>
  <b-container fluid>
    <b-row class="h-100 justify-content-center">
      <b-col sm="6" md="5" lg="4" xl="3">
        <b-card class="border-0" footer-bg-variant="white">
          <div class="mb-4 text-center">
            <b-img
              class="img-fluid text-center"
              src="@/assets/img/logo.png"
              width="200"
            ></b-img>
            <h3 class="mb-3 font-weight-bolder">Sign In</h3>
          </div>
          <form class="form-signin text-center" @submit.prevent="login">
            <b-form-group>
              <b-form-input
                trim
                type="email"
                placeholder="Email Address"
              ></b-form-input>
            </b-form-group>
            <b-form-group class="mb-2">
              <b-form-input
                trim
                type="password"
                placeholder="Password"
              ></b-form-input>
            </b-form-group>
            <b-button block to="/home">
              SIGN IN
            </b-button>
          </form>

          <b-button
            size="sm"
            variant="link"
            class="float-right pt-3 text-dark font-weight-bold text-decoration-none"
            >Forgot Password?
          </b-button>

          <template v-slot:footer>
            <p class="text-muted text-center small m-0">
              Don't have an account yet? <br />
              Go to
              <router-link to="/register" class="text-dark font-weight-bold"
                >Sign Up
              </router-link>
            </p>
          </template>
          <b-overlay :show="isBusy" no-wrap></b-overlay>
        </b-card>
      </b-col>
    </b-row>
  </b-container>
</template>

<script>
export default {
  name: "Login",
  data() {
    return {
      isBusy: false,
      form: {
        body: {
          email: "",
          password: ""
        }
      }
    };
  },
  methods: {
    login() {}
  }
};
</script>
