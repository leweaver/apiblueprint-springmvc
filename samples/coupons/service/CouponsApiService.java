package my.package.service;

import my.package.model.*;

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
public interface CouponsApiService {

	
    /**
     * Retrieves the coupon with the given ID.
     **/
    CouponBase retrieveACoupon(String id);
	
    /**
     * Returns a list of your coupons.
     **/
    List<Coupon> listAllCoupons(Integer limit);
	
    /**
     * Creates a new Coupon.
     **/
    Coupon createACoupon(CouponBase couponBaseBody);

}