<template>
  <b-container fluid>
    <b-row>
      <b-col sm="6" md="4">
        <b-card header-bg-variant="white" header-class="border-0">
          <template #header>
            <div class="d-flex justify-content-between align-items-center">
              <b-card-title class="m-0">Account details</b-card-title>
              <b-icon
                icon="patch-check-fill"
                variant="primary"
                scale="1.5"
              ></b-icon>
            </div>
          </template>
          <b-form>
            <b-form-group label="Full Name">
              <b-form-input type="text" placeholder=" "></b-form-input>
            </b-form-group>
            <b-form-group label="Email address">
              <b-form-input type="email" placeholder=" "></b-form-input>
            </b-form-group>
            <b-form-group label="Phone Number">
              <b-form-input type="text" placeholder=" "></b-form-input>
            </b-form-group>
          </b-form>
          <template #footer>
            <div class="d-flex justify-content-between">
              <b-button variant="danger">Delete Account</b-button>
              <b-button variant="success">Save</b-button>
            </div>
          </template>
        </b-card>
      </b-col>
    </b-row>
  </b-container>
</template>

<script>
export default {};
</script>

<style></style>
