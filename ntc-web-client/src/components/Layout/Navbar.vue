<template>
  <nav class="main-header navbar navbar-expand navbar-light border-0">
    <!-- Left navbar links -->
    <b-nav class="navbar-nav">
      <b-nav-item @click="toggle()">
        <b-link class="text-dark" data-widget="pushmenu" href="#" role="button">
          <b-icon icon="layout-sidebar"></b-icon
        ></b-link>
      </b-nav-item>
    </b-nav>

    <b-nav class="navbar-nav ml-auto">
      <b-nav-item>
        <b-button-group size="sm">
          <b-button
            variant="outline-dark"
            class="d-flex align-items-center"
            disabled
          >
            <b-img
              src="@/assets/logo/algorand_logo_mark_black.png"
              width="16"
              fluid
            ></b-img>
            <b>25.00</b>
          </b-button>
          <b-button variant="dark">Withdraw</b-button>
          <b-button variant="success">Top up</b-button>
        </b-button-group>
      </b-nav-item>
      <b-nav-item-dropdown text="Full Name" toggle-class="text-dark ">
        <b-dropdown-item to="/account" v-if="false">
          Profile
        </b-dropdown-item>
        <b-dropdown-item to="/">
          Logout
        </b-dropdown-item>
      </b-nav-item-dropdown>
    </b-nav>
  </nav>
</template>

<script>
import pushMenu from "@/mixins/PushMenu";
export default {
  mixins: [pushMenu]
};
</script>
