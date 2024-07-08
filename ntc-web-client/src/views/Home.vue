<template>
  <b-container fluid>
    <b-row align-v="center">
      <b-col lg="4" sm="6" cols="12">
        <b-list-group class="pb-3">
          <b-list-group-item
            class="d-flex justify-content-between align-items-center"
          >
            Data Pool
            <b-badge variant="dark">1</b-badge>
          </b-list-group-item>

          <b-list-group-item
            class="d-flex justify-content-between  align-items-center"
          >
            Digital Rights Tokens Sold
            <b-badge variant="dark">3</b-badge>
          </b-list-group-item>

          <b-list-group-item
            class="d-flex justify-content-between  align-items-center"
          >
            Digital Rights Tokens Purchased
            <b-badge variant="dark">1</b-badge>
          </b-list-group-item>
          <b-list-group-item
            class="d-flex justify-content-between  align-items-center"
          >
            Amount Paid Out
            <b-badge variant="dark">$20</b-badge>
          </b-list-group-item>
        </b-list-group>
      </b-col>
    </b-row>
    <b-row>
      <b-col>
        <b-table head-variant="dark" show-empty :fields="fields"></b-table>
      </b-col>
    </b-row>
  </b-container>
</template>

<script>
export default {
  name: "Home",
  data() {
    return {
      fields: ["Name", "Description", "Digital Rights", ""]
    };
  }
};
</script>
