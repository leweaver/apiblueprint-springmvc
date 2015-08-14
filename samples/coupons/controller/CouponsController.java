package my.package.controller;

import my.package.model.*;
import my.package.service.CouponsApiService;
import org.springframework.web.bind.annotation.*;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Created by apiblueprint-springmvc
 * 
 * This is an automatically generated file from apiblueprint:
 *   /Users/lweaver/repos/grunt-apiblueprint-springmvc/test/fixtures/resourceGroups.apib
 *
 * generated on: Thu Aug 13 2015 18:44:03 GMT+1000 (AEST)
 *
 * DO NOT MODIFY THIS FILE DIRECTLY.
 **/
@RestController
public class CouponsController {

    private CouponsApiService couponsApiService;

    @Autowired
    public CouponsController(CouponsApiService couponsApiService) {
        this.couponsApiService = couponsApiService;
    }
	
    /**
     * Retrieves the coupon with the given ID.
     **/
    @RequestMapping(value = "/coupons/{id}", method = RequestMethod.GET)
    public CouponBase retrieveACoupon(@PathVariable("id") String id) {
    	return couponsApiService.retrieveACoupon(id);
    }
	
    /**
     * Returns a list of your coupons.
     **/
    @RequestMapping(value = "/coupons{?limit}", method = RequestMethod.GET)
    public List<Coupon> listAllCoupons(@PathVariable("limit") Integer limit) {
    	return couponsApiService.listAllCoupons(limit);
    }
	
    /**
     * Creates a new Coupon.
     **/
    @RequestMapping(value = "/coupons", method = RequestMethod.POST)
    public Coupon createACoupon(@RequestBody CouponBase couponBaseBody) {
    	return couponsApiService.createACoupon(couponBaseBody);
    }

}