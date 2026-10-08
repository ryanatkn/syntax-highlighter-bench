<!-- stress: lists nested deep, and runs of emphasis, link, and code delimiters that never
close, where a pattern that backtracks retries at every opener -->

# Nested lists and unclosed emphasis

- level 0 with **bold, *italic, _under, `code and [a link](#l0 still open
  * level 1 with **bold, *italic, _under, `code and [a link](#l1 still open
    2. level 2 with **bold, *italic, _under, `code and [a link](#l2 still open
      - level 3 with **bold, *italic, _under, `code and [a link](#l3 still open
        * level 4 with **bold, *italic, _under, `code and [a link](#l4 still open
          5. level 5 with **bold, *italic, _under, `code and [a link](#l5 still open
            - level 6 with **bold, *italic, _under, `code and [a link](#l6 still open
              * level 7 with **bold, *italic, _under, `code and [a link](#l7 still open
                8. level 8 with **bold, *italic, _under, `code and [a link](#l8 still open
                  - level 9 with **bold, *italic, _under, `code and [a link](#l9 still open
                    * level 10 with **bold, *italic, _under, `code and [a link](#l10 still open
                      11. level 11 with **bold, *italic, _under, `code and [a link](#l11 still open
                        - level 12 with **bold, *italic, _under, `code and [a link](#l12 still open
                          * level 13 with **bold, *italic, _under, `code and [a link](#l13 still open
                            14. level 14 with **bold, *italic, _under, `code and [a link](#l14 still open
                              - level 15 with **bold, *italic, _under, `code and [a link](#l15 still open
                                * level 16 with **bold, *italic, _under, `code and [a link](#l16 still open
                                  17. level 17 with **bold, *italic, _under, `code and [a link](#l17 still open
                                    - level 18 with **bold, *italic, _under, `code and [a link](#l18 still open
                                      * level 19 with **bold, *italic, _under, `code and [a link](#l19 still open
                                        20. level 20 with **bold, *italic, _under, `code and [a link](#l20 still open
                                          - level 21 with **bold, *italic, _under, `code and [a link](#l21 still open
                                            * level 22 with **bold, *italic, _under, `code and [a link](#l22 still open
                                              23. level 23 with **bold, *italic, _under, `code and [a link](#l23 still open

## Delimiter runs

*a _b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d `e ~~f ~~f ~~f ~~f ~~f ~~f line 0

**a __b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ``e ~~f ~~f ~~f ~~f ~~f ~~f line 1

***a ___b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ```e ~~f ~~f ~~f ~~f ~~f ~~f line 2

****a ____b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ````e ~~f ~~f ~~f ~~f ~~f ~~f line 3

*****a _____b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d `e ~~f ~~f ~~f ~~f ~~f ~~f line 4

******a _b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ``e ~~f ~~f ~~f ~~f ~~f ~~f line 5

*******a __b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ```e ~~f ~~f ~~f ~~f ~~f ~~f line 6

*a ___b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ````e ~~f ~~f ~~f ~~f ~~f ~~f line 7

**a ____b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d `e ~~f ~~f ~~f ~~f ~~f ~~f line 8

***a _____b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ``e ~~f ~~f ~~f ~~f ~~f ~~f line 9

****a _b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ```e ~~f ~~f ~~f ~~f ~~f ~~f line 10

*****a __b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ````e ~~f ~~f ~~f ~~f ~~f ~~f line 11

******a ___b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d `e ~~f ~~f ~~f ~~f ~~f ~~f line 12

*******a ____b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ``e ~~f ~~f ~~f ~~f ~~f ~~f line 13

*a _____b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ```e ~~f ~~f ~~f ~~f ~~f ~~f line 14

**a _b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ````e ~~f ~~f ~~f ~~f ~~f ~~f line 15

***a __b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d `e ~~f ~~f ~~f ~~f ~~f ~~f line 16

****a ___b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ``e ~~f ~~f ~~f ~~f ~~f ~~f line 17

*****a ____b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ```e ~~f ~~f ~~f ~~f ~~f ~~f line 18

******a _____b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ````e ~~f ~~f ~~f ~~f ~~f ~~f line 19

*******a _b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d `e ~~f ~~f ~~f ~~f ~~f ~~f line 20

*a __b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ``e ~~f ~~f ~~f ~~f ~~f ~~f line 21

**a ___b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ```e ~~f ~~f ~~f ~~f ~~f ~~f line 22

***a ____b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ````e ~~f ~~f ~~f ~~f ~~f ~~f line 23

****a _____b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d `e ~~f ~~f ~~f ~~f ~~f ~~f line 24

*****a _b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ``e ~~f ~~f ~~f ~~f ~~f ~~f line 25

******a __b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ```e ~~f ~~f ~~f ~~f ~~f ~~f line 26

*******a ___b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ````e ~~f ~~f ~~f ~~f ~~f ~~f line 27

*a ____b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d `e ~~f ~~f ~~f ~~f ~~f ~~f line 28

**a _____b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ``e ~~f ~~f ~~f ~~f ~~f ~~f line 29

***a _b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ```e ~~f ~~f ~~f ~~f ~~f ~~f line 30

****a __b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ````e ~~f ~~f ~~f ~~f ~~f ~~f line 31

*****a ___b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d `e ~~f ~~f ~~f ~~f ~~f ~~f line 32

******a ____b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ``e ~~f ~~f ~~f ~~f ~~f ~~f line 33

*******a _____b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ```e ~~f ~~f ~~f ~~f ~~f ~~f line 34

*a _b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ````e ~~f ~~f ~~f ~~f ~~f ~~f line 35

**a __b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d `e ~~f ~~f ~~f ~~f ~~f ~~f line 36

***a ___b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ``e ~~f ~~f ~~f ~~f ~~f ~~f line 37

****a ____b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ```e ~~f ~~f ~~f ~~f ~~f ~~f line 38

*****a _____b **c **c **c **c **c **c **c **c **c **c **c **c [d [d [d [d [d [d [d [d ````e ~~f ~~f ~~f ~~f ~~f ~~f line 39

> > > > > > > > > > > > > > > > > > > > > > > > a quote nested deep, with *emphasis that never closes

